# Pull Statistics Background Worker Solution

## Problem Statement

We need to track pull count and last timestamp at both tag and manifest level to enable auto-pruning policies. The current audit logs are expensive to query and sometimes not queryable at all. We need a background worker to periodically query the logs model to find last timestamp and pull count and write to a new table that tracks both tag and digest level events.

## Requirements Analysis

1. **Tag Level Tracking**: When a tag is pulled, its pull count and timestamp is updated
2. **Manifest Level Tracking**: When pulled by tag OR digest, manifest's pull count and timestamp is updated
3. **Historical Data**: Must work for tags not pulled in years
4. **Performance**: Handle ~5000 req/sec without overwhelming database
5. **Logs Concern**: Current logs model is expensive to query and sometimes inaccessible

## Solution: Background Worker with Logs Aggregation

### Architecture Overview

```
Pull Events → Logs Model (existing) → Background Worker → PullStatistics Table
                  ↓                        ↓                     ↓
            Elasticsearch/DB        Periodic aggregation      Fast queries
```

**Benefits of this approach:**
- Uses existing logging infrastructure (no changes to high-traffic pull endpoints)
- Logs are already being written, just need to aggregate them
- Background processing doesn't impact pull performance
- Can handle historical data by processing older logs

### Database Schema

```python
# In data/database.py, add new models following existing patterns

class TagPullStatistics(BaseModel):
    """
    Individual tag pull statistics for granular tag-level tracking.
    Enables tag-specific auto-pruning policies.
    """
    
    repository = ForeignKeyField(Repository, index=True)
    tag_name = CharField(index=True)  # e.g., "v1.0", "latest"
    tag_pull_count = BigIntegerField(default=0)
    last_tag_pull_date = DateTimeField(index=True)
    current_manifest_digest = CharField()  # Current manifest this tag points to
    created = DateTimeField(default=datetime.now)
    updated = DateTimeField(default=datetime.now)
    
    class Meta:
        database = db
        read_only_config = read_only_config
        indexes = (
            (("repository", "tag_name"), True),  # Unique per repository
            (("repository", "last_tag_pull_date"), False),  # For tag-based pruning
            (("last_tag_pull_date",), False),  # Global tag pruning queries
        )

class ManifestPullStatistics(BaseModel):
    """
    Manifest-level pull statistics aggregating all access methods.
    Includes both tag pulls and direct digest pulls.
    """
    
    repository = ForeignKeyField(Repository, index=True)
    manifest_digest = CharField(index=True)  # Not globally unique, per repository
    total_pull_count = BigIntegerField(default=0)  # All pulls (tag + digest)
    last_pull_date = DateTimeField(index=True)
    last_tag_pulled = CharField(null=True)  # Most recent tag name used
    created = DateTimeField(default=datetime.now)
    updated = DateTimeField(default=datetime.now)
    
    class Meta:
        database = db
        read_only_config = read_only_config
        indexes = (
            (("repository", "manifest_digest"), True),  # Unique per repository
            (("repository", "last_pull_date"), False),  # For manifest-based pruning
            (("last_pull_date",), False),  # Global manifest pruning queries
        )

class PullStatisticsProcessingState(BaseModel):
    """
    Tracks worker progress for incremental log processing.
    """
    worker_id = CharField(unique=True)  # e.g., "pullstats_worker"
    last_processed_datetime = DateTimeField()
    last_processed_log_id = BigIntegerField(null=True)
    logs_processed_count = BigIntegerField(default=0)
    
    class Meta:
        database = db
        read_only_config = read_only_config
```

### Background Worker Implementation

```python
# In workers/pullstatssyncworker.py
import logging
import time
from datetime import datetime, timedelta

import features
from app import app
from data.database import PullStatistics, PullStatisticsProcessingState, Repository, Manifest, Tag
from data.logs_model import logs_model
from data.model import db_transaction
from util.locking import GlobalLock, LockNotAcquiredException
from workers.gunicorn_worker import GunicornWorker
from workers.worker import Worker

logger = logging.getLogger(__name__)

# Configuration
POLL_PERIOD = app.config.get("PULL_STATS_SYNC_PERIOD", 300)  # 5 minutes
BATCH_SIZE = app.config.get("PULL_STATS_BATCH_SIZE", 1000)
WORKER_ID = "pullstats_worker"
LOOKBACK_HOURS = app.config.get("PULL_STATS_LOOKBACK_HOURS", 24)  # For recovery


class PullStatsSyncWorker(Worker):
    """
    Background worker that processes pull logs and aggregates statistics.
    Follows patterns from LogRotateWorker and QuotaRegistrySizeWorker.
    """
    
    def __init__(self):
        super(PullStatsSyncWorker, self).__init__()
        self.add_operation(self._sync_pull_stats, POLL_PERIOD)
    
    def _sync_pull_stats(self):
        """Main worker operation - process logs and update statistics."""
        try:
            with GlobalLock(f"PULL_STATS_SYNC_{WORKER_ID}", lock_ttl=POLL_PERIOD * 2):
                self._process_pull_logs()
        except LockNotAcquiredException:
            logger.debug("Could not acquire pull stats sync lock")
            return
        except Exception as e:
            logger.exception("Error processing pull stats: %s", e)
    
    def _process_pull_logs(self):
        """Process pull logs and update statistics."""
        # Get last processing state
        processing_state = self._get_processing_state()
        
        # Determine time range for log processing
        start_datetime = processing_state.last_processed_datetime
        end_datetime = datetime.utcnow()
        
        logger.info(
            "Processing pull logs from %s to %s", 
            start_datetime, end_datetime
        )
        
        # Get pull logs from logs model
        pull_logs = self._get_pull_logs(start_datetime, end_datetime)
        
        if not pull_logs:
            logger.debug("No pull logs found in time range")
            return
        
        # Process logs in batches
        processed_count = 0
        batch = []
        latest_datetime = start_datetime
        latest_log_id = processing_state.last_processed_log_id
        
        for log_entry in pull_logs:
            batch.append(log_entry)
            latest_datetime = max(latest_datetime, log_entry['datetime'])
            if hasattr(log_entry, 'id'):
                latest_log_id = max(latest_log_id or 0, log_entry['id'])
            
            if len(batch) >= BATCH_SIZE:
                self._process_log_batch(batch)
                processed_count += len(batch)
                batch = []
        
        # Process remaining logs
        if batch:
            self._process_log_batch(batch)
            processed_count += len(batch)
        
        # Update processing state
        self._update_processing_state(latest_datetime, latest_log_id, processed_count)
        
        logger.info("Processed %d pull log entries", processed_count)
    
    def _get_processing_state(self):
        """Get or create processing state."""
        try:
            return PullStatisticsProcessingState.get(
                PullStatisticsProcessingState.worker_id == WORKER_ID
            )
        except PullStatisticsProcessingState.DoesNotExist:
            # Initialize for first run - look back 24 hours
            initial_datetime = datetime.utcnow() - timedelta(hours=LOOKBACK_HOURS)
            return PullStatisticsProcessingState.create(
                worker_id=WORKER_ID,
                last_processed_datetime=initial_datetime,
                logs_processed_count=0
            )
    
    def _get_pull_logs(self, start_datetime, end_datetime):
        """
        Get pull logs from logs model.
        Handles both database and elasticsearch implementations.
        """
        try:
            # Use logs_model to get pull events
            # This abstracts whether we're using database, elasticsearch, etc.
            pull_logs = logs_model.lookup_logs(
                start_datetime=start_datetime,
                end_datetime=end_datetime,
                filter_kinds=["pull_repo"],  # Current pull log kind
                size=BATCH_SIZE * 10  # Get larger batch for processing
            )
            
            return pull_logs
            
        except Exception as e:
            logger.warning("Failed to get pull logs from logs model: %s", e)
            # Fallback to direct database query if logs_model fails
            return self._get_pull_logs_from_database(start_datetime, end_datetime)
    
    def _get_pull_logs_from_database(self, start_datetime, end_datetime):
        """
        Fallback method to get pull logs directly from database.
        Used when logs_model is inaccessible.
        """
        from data.database import LogEntry, LogEntryKind
        
        try:
            pull_kind = LogEntryKind.get(LogEntryKind.name == "pull_repo")
            
            logs = (
                LogEntry.select()
                .where(
                    LogEntry.kind == pull_kind,
                    LogEntry.datetime >= start_datetime,
                    LogEntry.datetime <= end_datetime
                )
                .order_by(LogEntry.datetime)
                .limit(BATCH_SIZE * 10)
            )
            
            # Convert to format similar to logs_model output
            formatted_logs = []
            for log in logs:
                try:
                    import json
                    metadata = json.loads(log.metadata_json) if log.metadata_json else {}
                    formatted_logs.append({
                        'id': log.id,
                        'datetime': log.datetime,
                        'repository_id': log.repository,
                        'kind': 'pull_repo',
                        'metadata': metadata
                    })
                except Exception as e:
                    logger.warning("Error parsing log entry %d: %s", log.id, e)
                    continue
            
            return formatted_logs
            
        except Exception as e:
            logger.error("Failed to get pull logs from database: %s", e)
            return []
    
    def _process_log_batch(self, log_batch):
        """Process a batch of log entries."""
        with db_transaction():
            for log_entry in log_batch:
                try:
                    self._process_single_log(log_entry)
                except Exception as e:
                    logger.warning("Error processing log entry: %s", e)
                    continue
    
    def _process_single_log(self, log_entry):
        """Process a single pull log entry."""
        repository_id = log_entry.get('repository_id')
        metadata = log_entry.get('metadata', {})
        pull_datetime = log_entry['datetime']
        
        if not repository_id:
            return
        
        # Determine if this is a tag pull or manifest digest pull
        tag_name = metadata.get('tag')
        manifest_digest = metadata.get('manifest_digest')
        
        if tag_name:
            # Pull by tag - affects both tag and manifest stats
            self._update_tag_pull_stats(
                repository_id, tag_name, pull_datetime, manifest_digest
            )
        elif manifest_digest:
            # Pull by digest - affects only manifest stats
            self._update_manifest_pull_stats(
                repository_id, manifest_digest, pull_datetime, via_tag=None
            )
    
    def _update_tag_pull_stats(self, repository_id, tag_name, pull_datetime, manifest_digest=None):
        """Update statistics for a tag pull - updates both tag and manifest tables."""
        if not manifest_digest:
            # Look up manifest digest from current tag
            manifest_digest = self._get_manifest_digest_for_tag(repository_id, tag_name)
        
        if not manifest_digest:
            logger.warning(
                "Could not find manifest digest for tag %s in repo %d", 
                tag_name, repository_id
            )
            return
        
        # Update tag-specific statistics
        tag_stats, created = TagPullStatistics.get_or_create(
            repository=repository_id,
            tag_name=tag_name,
            defaults={
                'tag_pull_count': 1,
                'last_tag_pull_date': pull_datetime,
                'current_manifest_digest': manifest_digest,
                'updated': pull_datetime
            }
        )
        
        if not created:
            TagPullStatistics.update(
                tag_pull_count=TagPullStatistics.tag_pull_count + 1,
                last_tag_pull_date=pull_datetime,
                current_manifest_digest=manifest_digest,
                updated=pull_datetime
            ).where(
                TagPullStatistics.repository == repository_id,
                TagPullStatistics.tag_name == tag_name
            ).execute()
        
        # Update manifest-level statistics
        self._update_manifest_pull_stats(repository_id, manifest_digest, pull_datetime, via_tag=tag_name)
    
    def _update_manifest_pull_stats(self, repository_id, manifest_digest, pull_datetime, via_tag=None):
        """Update statistics for a manifest pull (from tag or direct digest)."""
        # Update or create manifest statistics record
        manifest_stats, created = ManifestPullStatistics.get_or_create(
            repository=repository_id,
            manifest_digest=manifest_digest,
            defaults={
                'total_pull_count': 1,
                'last_pull_date': pull_datetime,
                'last_tag_pulled': via_tag,
                'updated': pull_datetime
            }
        )
        
        if not created:
            # Update existing record
            update_fields = {
                'total_pull_count': ManifestPullStatistics.total_pull_count + 1,
                'updated': pull_datetime
            }
            
            # Update last pull date if this is more recent
            if pull_datetime > manifest_stats.last_pull_date:
                update_fields['last_pull_date'] = pull_datetime
                if via_tag:
                    update_fields['last_tag_pulled'] = via_tag
            
            ManifestPullStatistics.update(**update_fields).where(
                ManifestPullStatistics.repository == repository_id,
                ManifestPullStatistics.manifest_digest == manifest_digest
            ).execute()
    
    def _get_manifest_digest_for_tag(self, repository_id, tag_name):
        """Get current manifest digest for a tag."""
        try:
            from data.database import Tag, Manifest
            
            # Get current active tag
            tag = (
                Tag.select(Tag, Manifest)
                .join(Manifest)
                .where(
                    Tag.repository == repository_id,
                    Tag.name == tag_name,
                    Tag.lifetime_end_ms.is_null()  # Active tags only
                )
                .get()
            )
            
            return tag.manifest.digest
            
        except Tag.DoesNotExist:
            return None
        except Exception as e:
            logger.warning("Error getting manifest digest for tag %s: %s", tag_name, e)
            return None
    
    def _update_processing_state(self, latest_datetime, latest_log_id, processed_count):
        """Update worker processing state."""
        PullStatisticsProcessingState.update(
            last_processed_datetime=latest_datetime,
            last_processed_log_id=latest_log_id,
            logs_processed_count=PullStatisticsProcessingState.logs_processed_count + processed_count
        ).where(
            PullStatisticsProcessingState.worker_id == WORKER_ID
        ).execute()


def create_gunicorn_worker():
    """Create gunicorn worker following standard pattern."""
    worker = GunicornWorker(
        __name__, 
        app, 
        PullStatsSyncWorker(), 
        features.PULL_STATISTICS_TRACKING  # Feature flag
    )
    return worker


if __name__ == "__main__":
    if app.config.get("ACCOUNT_RECOVERY_MODE", False):
        logger.debug("Quay running in account recovery mode")
        while True:
            time.sleep(100000)

    if not features.PULL_STATISTICS_TRACKING:
        logger.debug("Pull statistics tracking disabled; skipping worker")
        while True:
            time.sleep(100000)

    import logging.config
    from util.log import logfile_path
    
    logging.config.fileConfig(logfile_path(debug=False), disable_existing_loggers=False)
    worker = PullStatsSyncWorker()
    worker.start()
```

### API Endpoints for Statistics

```python
# In endpoints/api/repository.py, add new endpoints
@api_v1_bp.route('/repository/<path:repository>/pull_statistics')
@parse_repository_name()
@require_repo_read
@show_if(features.PULL_STATISTICS_TRACKING)
def get_repository_pull_statistics(namespace_name, repository_name):
    """Get aggregated pull statistics for repository."""
    repository = model.repository.get_repository(namespace_name, repository_name)
    if not repository:
        raise NotFound()
    
    # Get tag statistics
    tag_stats = list(
        TagPullStatistics.select()
        .where(TagPullStatistics.repository == repository.id)
        .order_by(TagPullStatistics.last_tag_pull_date.desc())
    )
    
    # Get manifest statistics  
    manifest_stats = list(
        ManifestPullStatistics.select()
        .where(ManifestPullStatistics.repository == repository.id)
        .order_by(ManifestPullStatistics.last_pull_date.desc())
    )
    
    return jsonify({
        'tag_statistics': [
            {
                'tag_name': stat.tag_name,
                'tag_pull_count': stat.tag_pull_count,
                'last_tag_pull_date': stat.last_tag_pull_date.isoformat(),
                'current_manifest_digest': stat.current_manifest_digest,
            }
            for stat in tag_stats
        ],
        'manifest_statistics': [
            {
                'manifest_digest': stat.manifest_digest,
                'total_pull_count': stat.total_pull_count,
                'last_pull_date': stat.last_pull_date.isoformat(),
                'last_tag_pulled': stat.last_tag_pulled,
            }
            for stat in manifest_stats
        ]
    })

@api_v1_bp.route('/repository/<path:repository>/tag/<tagname>/pull_statistics')
@parse_repository_name()
@require_repo_read
@show_if(features.PULL_STATISTICS_TRACKING)
def get_tag_pull_statistics(namespace_name, repository_name, tagname):
    """Get pull statistics for a specific tag."""
    repository = model.repository.get_repository(namespace_name, repository_name)
    if not repository:
        raise NotFound()
    
    # Get tag statistics
    try:
        tag_stats = TagPullStatistics.get(
            TagPullStatistics.repository == repository.id,
            TagPullStatistics.tag_name == tagname
        )
        
        # Get corresponding manifest statistics
        manifest_stats = ManifestPullStatistics.get(
            ManifestPullStatistics.repository == repository.id,
            ManifestPullStatistics.manifest_digest == tag_stats.current_manifest_digest
        )
        
        return jsonify({
            'tag_name': tagname,
            'tag_pull_count': tag_stats.tag_pull_count,
            'last_tag_pull_date': tag_stats.last_tag_pull_date.isoformat(),
            'manifest_digest': tag_stats.current_manifest_digest,
            'manifest_total_pull_count': manifest_stats.total_pull_count,
            'manifest_last_pull_date': manifest_stats.last_pull_date.isoformat(),
        })
        
    except TagPullStatistics.DoesNotExist:
        # No tag statistics yet - return zeros
        return jsonify({
            'tag_name': tagname,
            'tag_pull_count': 0,
            'last_tag_pull_date': None,
            'manifest_digest': None,
            'manifest_total_pull_count': 0,
            'manifest_last_pull_date': None,
        })

@api_v1_bp.route('/repository/<path:repository>/manifest/<digest>/pull_statistics')
@parse_repository_name()
@require_repo_read
@show_if(features.PULL_STATISTICS_TRACKING)
def get_manifest_pull_statistics(namespace_name, repository_name, digest):
    """Get pull statistics for a specific manifest."""
    repository = model.repository.get_repository(namespace_name, repository_name)
    if not repository:
        raise NotFound()
    
    try:
        manifest_stats = ManifestPullStatistics.get(
            ManifestPullStatistics.repository == repository.id,
            ManifestPullStatistics.manifest_digest == digest
        )
        
        # Get all tags currently pointing to this manifest
        current_tags = list(
            TagPullStatistics.select()
            .where(
                TagPullStatistics.repository == repository.id,
                TagPullStatistics.current_manifest_digest == digest
            )
        )
        
        return jsonify({
            'manifest_digest': digest,
            'total_pull_count': manifest_stats.total_pull_count,
            'last_pull_date': manifest_stats.last_pull_date.isoformat(),
            'last_tag_pulled': manifest_stats.last_tag_pulled,
            'current_tags': [
                {
                    'tag_name': tag.tag_name,
                    'tag_pull_count': tag.tag_pull_count,
                    'last_tag_pull_date': tag.last_tag_pull_date.isoformat()
                }
                for tag in current_tags
            ]
        })
        
    except ManifestPullStatistics.DoesNotExist:
        return jsonify({
            'manifest_digest': digest,
            'total_pull_count': 0,
            'last_pull_date': None,
            'last_tag_pulled': None,
            'current_tags': []
        })
```

### Feature Flag

```python
# In features/__init__.py, add feature flag
PULL_STATISTICS_TRACKING = FeatureNameValue('PULL_STATISTICS_TRACKING', 'Pull Statistics Tracking')
```

### Configuration Options

```python
# In config.py, add configuration options
class DefaultConfig:
    # Pull statistics worker configuration
    PULL_STATS_SYNC_PERIOD = 300  # 5 minutes
    PULL_STATS_BATCH_SIZE = 1000
    PULL_STATS_LOOKBACK_HOURS = 24  # For initial processing
    
    # Feature flag
    FEATURE_PULL_STATISTICS_TRACKING = False
```

### Database Migration

```python
# Migration script to create tables
def upgrade():
    # Create TagPullStatistics table
    op.create_table(
        'tagpullstatistics',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('repository_id', sa.Integer(), nullable=False),
        sa.Column('tag_name', sa.String(length=255), nullable=False),
        sa.Column('tag_pull_count', sa.BigInteger(), nullable=False, default=0),
        sa.Column('last_tag_pull_date', sa.DateTime(), nullable=False),
        sa.Column('current_manifest_digest', sa.String(length=255), nullable=False),
        sa.Column('created', sa.DateTime(), nullable=False),
        sa.Column('updated', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create ManifestPullStatistics table
    op.create_table(
        'manifestpullstatistics',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('repository_id', sa.Integer(), nullable=False),
        sa.Column('manifest_digest', sa.String(length=255), nullable=False),
        sa.Column('total_pull_count', sa.BigInteger(), nullable=False, default=0),
        sa.Column('last_pull_date', sa.DateTime(), nullable=False),
        sa.Column('last_tag_pulled', sa.String(length=255), nullable=True),
        sa.Column('created', sa.DateTime(), nullable=False),
        sa.Column('updated', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes for TagPullStatistics
    op.create_index('tagpullstatistics_repository_tag', 'tagpullstatistics', 
                   ['repository_id', 'tag_name'], unique=True)
    op.create_index('tagpullstatistics_repository_lastpull', 'tagpullstatistics',
                   ['repository_id', 'last_tag_pull_date'])
    op.create_index('tagpullstatistics_lastpull', 'tagpullstatistics', 
                   ['last_tag_pull_date'])
    
    # Create indexes for ManifestPullStatistics
    op.create_index('manifestpullstatistics_repository_manifest', 'manifestpullstatistics', 
                   ['repository_id', 'manifest_digest'], unique=True)
    op.create_index('manifestpullstatistics_repository_lastpull', 'manifestpullstatistics',
                   ['repository_id', 'last_pull_date'])
    op.create_index('manifestpullstatistics_lastpull', 'manifestpullstatistics', 
                   ['last_pull_date'])
    
    # Create processing state table
    op.create_table(
        'pullstatisticsprocessingstate',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('worker_id', sa.String(length=255), nullable=False),
        sa.Column('last_processed_datetime', sa.DateTime(), nullable=False),
        sa.Column('last_processed_log_id', sa.BigInteger(), nullable=True),
        sa.Column('logs_processed_count', sa.BigInteger(), nullable=False, default=0),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('worker_id')
    )
```

## Benefits of This Solution

1. **Uses Existing Infrastructure**: Leverages current logging system without modifying high-traffic endpoints
2. **Handles Historical Data**: Can process old logs to backfill statistics
3. **Resilient to Log Issues**: Includes fallback to direct database queries when logs_model is inaccessible
4. **Incremental Processing**: Tracks processing state to avoid reprocessing logs
5. **Performance**: Background processing doesn't impact pull response times
6. **Flexible**: Can adjust processing frequency and batch sizes based on load
7. **Feature Gated**: Behind feature flag for safe rollout

## Operational Considerations

1. **Monitoring**: Add metrics for worker health, processing lag, and error rates
2. **Recovery**: Worker can resume from last processed timestamp if restarted
3. **Backfill**: For historical data, can set initial lookback period
4. **Scaling**: Can run multiple workers with different worker_ids if needed
5. **Maintenance**: Periodic cleanup of old processing state records

This solution addresses the core concern about expensive/inaccessible logs by processing them in background and creating a fast-query table for pull statistics.