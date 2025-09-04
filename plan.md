# Implementation Plan: Last Pull Date and Pull Count Tracking

## Tag-to-Manifest Relationship in Quay: Detailed Analysis

### **Database Schema Analysis**

**Tag Table Structure**:
```python
class Tag(BaseModel):
    name = CharField()                    # e.g., "v1.0", "latest", "main"
    repository = ForeignKeyField(Repository)
    manifest = ForeignKeyField(Manifest, null=True)  # 👈 ONE manifest per tag
    lifetime_start_ms = BigIntegerField()  # When tag was created/moved
    lifetime_end_ms = BigIntegerField(null=True)  # When tag was deleted (NULL = active)
```

**Manifest Table Structure**:
```python
class Manifest(BaseModel):
    repository = ForeignKeyField(Repository)
    digest = CharField(index=True)       # e.g., "sha256:abc123..."
    # Unique constraint: (repository, digest) - ONE manifest per digest per repo
```

### **Key Relationship Rules**

1. **One Tag → One Manifest**: Each tag points to exactly ONE manifest at any given time
2. **One Manifest ← Many Tags**: Multiple tags can point to the SAME manifest
3. **No Multiple Manifests per Tag**: A tag cannot point to multiple manifests simultaneously
4. **Tag History**: When a tag moves, old record gets `lifetime_end_ms` set, new record created

### **Concrete Examples**

**Example 1: Multiple Tags Pointing to Same Manifest**
```sql
-- Manifest table
| id | repository_id | digest           |
|----|---------------|------------------|
| 50 | 100          | sha256:abc123... |

-- Tag table  
| id | name    | repository_id | manifest_id | lifetime_end_ms |
|----|---------|---------------|-------------|-----------------|
| 10 | v1.0    | 100          | 50          | NULL (active)   |
| 11 | v1.1    | 100          | 50          | NULL (active)   |
| 12 | latest  | 100          | 50          | NULL (active)   |

-- Result: Tags "v1.0", "v1.1", and "latest" ALL point to the same manifest (sha256:abc123)
```

**Example 2: Tag Moving to Different Manifest (Tag History)**
```sql
-- Initial state: "latest" points to old manifest
| id | name   | repository_id | manifest_id | lifetime_start_ms | lifetime_end_ms |
|----|--------|---------------|-------------|-------------------|-----------------|
| 20 | latest | 100          | 50          | 1640995200000     | 1641081600000   |

-- After docker push: "latest" moved to new manifest  
| id | name   | repository_id | manifest_id | lifetime_start_ms | lifetime_end_ms |
|----|--------|---------------|-------------|-------------------|-----------------|
| 20 | latest | 100          | 50          | 1640995200000     | 1641081600000   | # OLD (ended)
| 21 | latest | 100          | 75          | 1641081600000     | NULL            | # NEW (active)

-- Result: "latest" tag moved from manifest 50 to manifest 75
```

**Example 3: Manifest with No Tags (Orphaned)**
```sql
-- Manifest exists but no active tags point to it
| manifest_id | digest           | has_active_tags |
|-------------|------------------|-----------------|
| 60         | sha256:xyz789... | FALSE           |

-- This can happen when:
-- 1. All tags pointing to it were deleted
-- 2. All tags were moved to other manifests
-- 3. Manifest was pushed by digest but never tagged
```

### **Pull Scenarios and Impact**

**Scenario 1: Pull by Tag**
```bash
docker pull quay.io/repo/image:v1.0
```
```python
# What happens:
# 1. Lookup tag "v1.0" → finds manifest_id=50
# 2. Pull count affects:
#    - Tag "v1.0" pull count++
#    - Manifest sha256:abc123 pull count++
```

**Scenario 2: Pull by Digest**  
```bash
docker pull quay.io/repo/image@sha256:abc123...
```
```python
# What happens:
# 1. Lookup manifest by digest directly
# 2. Pull count affects:
#    - Manifest sha256:abc123 pull count++
#    - NO specific tag count affected (could be v1.0, v1.1, or latest)
```

**Scenario 3: Multiple Tags, One Manifest**
```bash
# All these pulls hit the SAME manifest
docker pull quay.io/repo/image:v1.0     # tag_id=10, manifest_id=50
docker pull quay.io/repo/image:v1.1     # tag_id=11, manifest_id=50  
docker pull quay.io/repo/image:latest   # tag_id=12, manifest_id=50
docker pull quay.io/repo/image@sha256:abc123  # direct to manifest_id=50
```

**Result Tracking**:
- Tag "v1.0": 1 pull
- Tag "v1.1": 1 pull  
- Tag "latest": 1 pull
- Manifest sha256:abc123: **4 pulls total** (3 via tags + 1 direct)

### **Why Separate Tag and Manifest Tracking is Critical**

1. **Tag Popularity**: Shows which tag names are most used
2. **Manifest Popularity**: Shows actual image popularity regardless of tag name
3. **Auto-Pruning Logic**: 
   - Prune tags with low pull counts
   - Keep manifests if ANY tag pointing to them is popular
   - Handle orphaned manifests (no tags) based on direct digest pulls

### **Database Queries for UI Display**

**For Tag "v1.0" Statistics**:
```sql
-- Tag-specific stats
SELECT COUNT(*) as tag_pulls, MAX(datetime) as last_tag_pull
FROM tag_pull_stats 
WHERE tag_id = 10;

-- Manifest stats for the same image
SELECT COUNT(*) as manifest_pulls, MAX(datetime) as last_manifest_pull  
FROM manifest_pull_stats
WHERE manifest_digest = 'sha256:abc123...';

-- UI Display:
-- Tag "v1.0": 15 tag pulls, last pulled 2 hours ago
-- Image total: 47 pulls (includes other tags + direct digest pulls)
```

This design allows Quay to track both tag-level popularity and overall image popularity, which is essential for intelligent auto-pruning policies!

## Problem Analysis

Track last pull date and pull count for image tags and manifests in Quay to enable auto-pruning rules, with support for high-volume operations (~5000 req/sec). Current audit logs are expensive to query and don't provide easy access to pull statistics.

## Current Quay Architecture Analysis

### Existing Log System
- **LogEntryKind table** (`data/database.py:1352`): Contains predefined log types
- **LogEntry tables**: LogEntry, LogEntry2, LogEntry3 for different log models
- **Current flow**: `track_and_log()` → `logs_model.log_action()` → Database/Elasticsearch
- **Pull logging**: Currently done via `track_and_log("pull_repo", repository_ref)` in `endpoints/v2/manifest.py:121`

### Tag vs Manifest Relationship & Pull Code Flow

**Database Relationships**:
- **Tag** (`data/database.py:1834`): `manifest = ForeignKeyField(Manifest, null=True)` (Many-to-One)
- **Manifest** (`data/database.py:1795`): Can be referenced by multiple tags, identified by unique `digest`
- **ManifestChild** (`data/database.py:1869`): Links parent manifest to child manifests (for manifest lists)

**Pull Code Flow Analysis**:

**Pull by Tag**: `GET /v2/{name}/manifests/{tag_name}`
```python
# endpoints/v2/manifest.py:74
def fetch_manifest_by_tagname(namespace_name, repo_name, manifest_ref, registry_model):
    # 1. Lookup repository
    repository_ref = registry_model.lookup_repository(namespace_name, repo_name)
    
    # 2. Get tag by name
    tag = registry_model.get_repo_tag(repository_ref, manifest_ref, raise_on_error=True)
    
    # 3. Get manifest from tag
    manifest = registry_model.get_manifest_for_tag(tag)
    
    # 4. Log pull event (CURRENT)
    track_and_log("pull_repo", repository_ref, tag=manifest_ref)
    
    # Key Methods Called:
    # - registry_model.get_repo_tag() → queries Tag table by name
    # - registry_model.get_manifest_for_tag() → follows Tag.manifest FK
    # - track_and_log() → creates LogEntry and ES index
```

**Pull by Digest**: `GET /v2/{name}/manifests/{digest}`
```python
# endpoints/v2/manifest.py:148
def fetch_manifest_by_digest(namespace_name, repo_name, manifest_ref, registry_model):
    # 1. Lookup repository
    repository_ref = registry_model.lookup_repository(namespace_name, repo_name)
    
    # 2. Get manifest by digest directly (NO TAG INVOLVED)
    manifest = registry_model.lookup_cached_manifest_by_digest(
        model_cache, repository_ref, manifest_ref
    )
    
    # 3. Log pull event (CURRENT)
    track_and_log("pull_repo", repository_ref, manifest_digest=manifest_ref)
    
    # Key Methods Called:
    # - registry_model.lookup_cached_manifest_by_digest() → queries Manifest table by digest
    # - NO tag table interaction
    # - track_and_log() → creates LogEntry with manifest_digest metadata
```

**Pull by Digest Impact on Tags**:
- Pull by digest **DOES NOT** directly affect any specific tag
- One manifest can have multiple tags pointing to it
- When pulling by digest, we don't know which tag (if any) the user intended
- This is why separate tag and manifest tracking is needed

### Existing Infrastructure Deep Dive

**Redis Usage in Quay**:
- **Purpose**: Model cache layer (`data/cache/__init__.py:42`)
- **Configuration**: `DATA_MODEL_CACHE_CONFIG` in app config
- **Engines**: Supports `redis` and `rediscluster` (`data/cache/redis_cache.py`)
- **Features**: Read/write split with `ReadEndpointSupportedRedis` wrapper
- **Current Use**: Caches repository, manifest, and tag lookups for performance

**Elasticsearch Infrastructure**:
- **Index Pattern**: `logentry_YYYY-MM-DD` (daily indices)
- **Index Prefix**: Configurable via `INDEX_NAME_PREFIX` (`data/logs_model/elastic_logs.py:18`)
- **Retention**: 30-day default via `STALE_AFTER` in `logrotateworker.py:26`
- **Template Management**: Auto-creates index templates with mappings
- **Custom Indices**: Possible with different `index_prefix` for separate retention policies

**Background Workers**: Pattern like `QuotaRegistrySizeWorker` with `add_operation()` and configurable poll periods

## Solution Options

### 1. Existing Usage Logs Enhancement (REPO-ALIGNED)

**Overview**: Extend current logging system with new LogEntryKind entries for pull tracking.

**Detailed Implementation Steps**:

1. **Add New LogEntryKind Types**:
   ```sql
   -- Migration to add new log types
   INSERT INTO logentryKind (name) VALUES ('tag_pull_stat');
   INSERT INTO logentryKind (name) VALUES ('manifest_pull_stat');
   ```

2. **Extend Current Pull Logging with Detailed Flow**:
   ```python
   # In endpoints/v2/manifest.py, modify existing track_and_log calls
   def fetch_manifest_by_tagname(namespace_name, repo_name, manifest_ref, registry_model):
       # ... existing code until line 121 ...
       
       # EXISTING: track_and_log("pull_repo", repository_ref, tag=manifest_ref)
       
       # NEW: Add pull stats tracking for BOTH tag and manifest
       if features.PULL_STATISTICS_TRACKING:
           tag = registry_model.get_repo_tag(repository_ref, manifest_ref)
           manifest = registry_model.get_manifest_for_tag(tag)
           
           # Record tag pull stat (requirement: track per tag)
           logs_model.log_action(
               "tag_pull_stat",
               namespace_name,
               performer=get_authenticated_user(),
               ip=get_request_ip(),
               metadata={"tag_id": tag.id, "tag_name": manifest_ref, "manifest_digest": manifest.digest},
               repository=repository_ref
           )
           
           # Record manifest pull stat (requirement: track per manifest)
           logs_model.log_action(
               "manifest_pull_stat", 
               namespace_name,
               performer=get_authenticated_user(),
               ip=get_request_ip(),
               metadata={"manifest_id": manifest.id, "manifest_digest": manifest.digest, "via_tag": manifest_ref},
               repository=repository_ref
           )
   
   def fetch_manifest_by_digest(namespace_name, repo_name, manifest_ref, registry_model):
       # ... existing code until line 173 ...
       
       # EXISTING: track_and_log("pull_repo", repository_ref, manifest_digest=manifest_ref)
       
       # NEW: Only manifest pull stat (no tag involved)
       if features.PULL_STATISTICS_TRACKING:
           manifest = registry_model.lookup_cached_manifest_by_digest(...)
           
           # Record manifest pull stat only
           logs_model.log_action(
               "manifest_pull_stat",
               namespace_name, 
               performer=get_authenticated_user(),
               ip=get_request_ip(),
               metadata={"manifest_id": manifest.id, "manifest_digest": manifest_ref, "via_tag": None},
               repository=repository_ref
           )
   ```

**How `logs_model.log_action()` Flows to Elasticsearch**:
```python
# util/audit.py:93 → data/logs_model/__init__.py → table_logs_model.py:232
def log_action(kind_name, namespace_name, performer=None, ip=None, metadata=None, repository=None):
    # 1. Create LogEntry in database
    model.log.log_action(kind_name, namespace_name, performer, repository, ip, metadata)
    
    # 2. If ES enabled, async index to Elasticsearch
    # data/logs_model/elastic_logs.py:88
    def save(self, **kwargs):
        # Creates daily index: tag_pull_stat_2024-01-15, manifest_pull_stat_2024-01-15
        index_name = self.datetime.strftime(self._index_prefix + INDEX_DATE_FORMAT)
        # index_name = "tag_pull_stat_2024-01-15" or "manifest_pull_stat_2024-01-15"
```

**Querying Elasticsearch Pull Stats**:
```python
# To get tag pull count and last timestamp
GET /tag_pull_stat_*/_search
{
  "query": {
    "bool": {
      "must": [
        {"term": {"metadata.tag_id": 12345}},
        {"range": {"datetime": {"gte": "now-2y"}}}  # Last 2 years
      ]
    }
  },
  "aggs": {
    "pull_count": {"value_count": {"field": "datetime"}},
    "last_pull": {"max": {"field": "datetime"}}
  }
}
```

3. **Elasticsearch Custom Index with Extended Retention**:
   ```python
   # In data/logs_model/elastic_logs.py, create separate pull stats indices
   class PullStatsLogEntry(LogEntry):
       @classmethod
       def init(cls, index_prefix="pullstats_", index_settings=None):
           # Extended retention for pull stats (years instead of 30 days)
           custom_settings = {
               "index.lifecycle.name": "pullstats_policy",
               "index.lifecycle.rollover_alias": "pullstats",
               "index.number_of_shards": 1,
               "index.number_of_replicas": 0,  # Reduce storage for long retention
               "index.refresh_interval": "30s"  # Less frequent refresh for older data
           }
           super().init(index_prefix, custom_settings)
   
   # Usage: separate indices with different retention
   # pullstats_tag_2024-01-15    → retains for 2+ years
   # pullstats_manifest_2024-01-15 → retains for 2+ years  
   # logentry_2024-01-15        → standard 30-day retention
   ```

**Index Prefix Benefits for Pull Stats**:
- **Separate Retention**: Different `index_prefix` allows independent retention policies
- **Performance**: Smaller indices for pull stats vs general logs
- **Storage Optimization**: Configure different shard/replica settings
- **Query Efficiency**: Direct queries to pull stats indices avoid scanning general logs

4. **Query Service Using Existing lookup_latest_logs**:
   ```python
   # In data/logs_model/table_logs_model.py
   def get_pull_statistics(self, tag_id=None, manifest_id=None):
       filter_kinds = ["tag_pull_stat", "manifest_pull_stat"]
       
       # Use existing lookup_latest_logs function
       logs = self.lookup_latest_logs(
           filter_kinds=filter_kinds,
           size=1000  # Get more entries for aggregation
       )
       
       # Aggregate pull counts and latest timestamps
       stats = self._aggregate_pull_stats(logs, tag_id, manifest_id)
       return stats
   ```

5. **UI Integration Using Existing Patterns**:
   ```python
   # In endpoints/api/tag.py, following existing API patterns
   @api_v1_bp.route('/repository/<path:repository>/tag/<tagname>/pull_stats')
   @parse_repository_name()
   def get_tag_pull_statistics(namespace_name, repository_name, tagname):
       # Use existing repository lookup patterns
       repository = model.repository.get_repository(namespace_name, repository_name)
       if not repository:
           raise NotFound()
           
       # Get pull stats using enhanced logs model
       stats = logs_model.get_pull_statistics(tag_name=tagname, repository=repository)
       return jsonify(stats)
   ```

**Complexity**: Medium  
**Difficulty**: Low-Medium

**Tag vs Manifest Pull Count Interaction Example**:
```python
# Scenario: Tag "v1.0" points to manifest "sha256:abc123"

# 1. Pull by tag: docker pull repo/image:v1.0
fetch_manifest_by_tagname("myrepo", "myimage", "v1.0", registry_model)
# → Creates tag_pull_stat entry (tag_id=100, tag_name="v1.0", manifest_digest="sha256:abc123")
# → Creates manifest_pull_stat entry (manifest_id=50, manifest_digest="sha256:abc123", via_tag="v1.0")
# Result: tag v1.0 count++, manifest sha256:abc123 count++

# 2. Pull by digest: docker pull repo/image@sha256:abc123  
fetch_manifest_by_digest("myrepo", "myimage", "sha256:abc123", registry_model)
# → Creates manifest_pull_stat entry (manifest_id=50, manifest_digest="sha256:abc123", via_tag=null)
# Result: manifest sha256:abc123 count++, NO tag count change

# 3. UI Display for tag "v1.0":
# - Tag pull count: COUNT(tag_pull_stat WHERE tag_id=100)
# - Manifest pull count: COUNT(manifest_pull_stat WHERE manifest_digest="sha256:abc123") 
# - Last tag pull: MAX(datetime FROM tag_pull_stat WHERE tag_id=100)
# - Last manifest pull: MAX(datetime FROM manifest_pull_stat WHERE manifest_digest="sha256:abc123")
```

**Pros**:
- Uses existing logging infrastructure
- Elasticsearch already handles high volume
- Audit trail maintained
- **Extended retention for years** (separate index_prefix)
- **Handles historical data** for tags not pulled recently

**Cons**:
- 2-3 second delay for ES indexing
- Aggregation queries expensive on large datasets
- ES cluster sizing for long retention
- Complex queries for UI (requires ES knowledge)

**Elasticsearch Code Flow**:
```
Pull Request → LogEntry Creation → ES Queue → ES Indexer → ES Index (pullstats_*)
                     ↓
API Query → ES Search → Aggregation → JSON Response → UI Display
Retention: pullstats_* indices kept for 2+ years vs logentry_* for 30 days
```

### 2. Redis Cache + Periodic Database Sync (REPO-ALIGNED)

**Overview**: Use existing Redis infrastructure for high-performance tracking with background sync worker.

**Detailed Implementation Steps**:

1. **Database Schema - Repository + Digest Tracking**:
   ```python
   # In data/database.py, add new model following existing patterns
   class PullStatistics(BaseModel):
       """Track pull statistics per manifest within each repository."""
       
       repository = ForeignKeyField(Repository, index=True)
       manifest_digest = CharField(index=True)  # Unique per repository, not globally
       last_pull_via_tag = CharField(null=True)  # Last tag used (if any)
       last_pull_date = DateTimeField(index=True)
       pull_count = BigIntegerField(default=0)
       tag_pull_count = BigIntegerField(default=0)  # Subset of total pulls
       created = DateTimeField(default=datetime.now)
       updated = DateTimeField(default=datetime.now)
       
       class Meta:
           database = db
           read_only_config = read_only_config
           indexes = (
               (("repository", "manifest_digest"), True),  # Unique per repository
               (("repository", "last_pull_date"), False),  # For pruning queries
           )
   ```

2. **Redis Service Using Existing Cache Infrastructure**:
   ```python
   # In data/cache/pull_stats_cache.py
   from data.cache import redis_cache_from_config
   
   class RedisPullTracker:
       def __init__(self):
           # Use existing cache config pattern (data/cache/__init__.py:42)
           cache_config = app.config.get("DATA_MODEL_CACHE_CONFIG", {})
           self.redis = redis_cache_from_config(cache_config)
           
       def record_pull(self, repository_id, tag_id=None, tag_name=None, manifest_id=None, manifest_digest=None):
           """Record pull for BOTH tag and manifest as per requirements"""
           pipe = self.redis.pipeline()
           timestamp = int(time.time())
           
           # Tag-specific tracking (if tag pull)
           if tag_id and tag_name:
               tag_key = f"pullstats:tag:{repository_id}:{tag_id}"
               pipe.hset(tag_key, "last_pull", timestamp)
               pipe.hincrby(tag_key, "count", 1)
               pipe.hset(tag_key, "tag_name", tag_name)
               pipe.hset(tag_key, "manifest_digest", manifest_digest)
               pipe.expire(tag_key, 86400 * 30)  # 30-day TTL in Redis
               
               # Add to sync queue
               pipe.sadd("pullstats:sync:tags", f"{repository_id}:{tag_id}:{timestamp}")
           
           # Manifest tracking (for both tag and digest pulls)
           if manifest_id and manifest_digest:
               manifest_key = f"pullstats:manifest:{repository_id}:{manifest_digest}"
               pipe.hset(manifest_key, "last_pull", timestamp)
               pipe.hincrby(manifest_key, "count", 1)
               pipe.hset(manifest_key, "manifest_id", manifest_id)
               if tag_name:
                   pipe.hset(manifest_key, "last_via_tag", tag_name)
               pipe.expire(manifest_key, 86400 * 30)  # 30-day TTL
               
               # Add to sync queue  
               pipe.sadd("pullstats:sync:manifests", f"{repository_id}:{manifest_digest}:{timestamp}")
           
           pipe.execute()
   
   # Usage in pull handlers:
   # Pull by tag: record_pull(repo_id, tag_id=100, tag_name="v1.0", manifest_id=50, manifest_digest="sha256:abc")
   # Pull by digest: record_pull(repo_id, manifest_id=50, manifest_digest="sha256:abc")
   ```

3. **Background Sync Worker Following QuotaRegistrySizeWorker Pattern**:
   ```python
   # In workers/pullstatssyncworker.py
   import features
   from workers.worker import Worker
   from workers.gunicorn_worker import GunicornWorker
   
   class PullStatsSyncWorker(Worker):
       def __init__(self):
           super(PullStatsSyncWorker, self).__init__()
           poll_period = app.config.get("PULL_STATS_SYNC_PERIOD", 300)  # 5 minutes
           self.add_operation(self._sync_pull_stats, poll_period)
           
       def _sync_pull_stats(self):
           # Scan for sync keys and batch update database
           sync_pattern = "pullstats:sync:*"
           for key in self.redis.scan_iter(match=sync_pattern, count=100):
               self._process_sync_key(key)
               
   def create_gunicorn_worker():
       worker = GunicornWorker(__name__, app, PullStatsSyncWorker(), 
                             features.PULL_STATISTICS_TRACKING)
       return worker
   ```

4. **Pull Handler Integration Using Existing Patterns**:
   ```python
   # In endpoints/v2/manifest.py, modify existing pull handlers
   def fetch_manifest_by_tagname(namespace_name, repo_name, manifest_ref, registry_model):
       # ... existing code until track_and_log call ...
       
       # EXISTING: track_and_log("pull_repo", repository_ref, tag=manifest_ref)
       
       # NEW: Add Redis pull tracking
       if features.PULL_STATISTICS_TRACKING:
           from data.cache.pull_stats_cache import RedisPullTracker
           
           tracker = RedisPullTracker()
           tracker.record_pull(
               repository_ref.id,
               manifest_digest,
               tag_name=manifest_ref
           )
       
       # Return existing response...
   ```

5. **API Following Existing Endpoint Patterns**:
   ```python
   # In endpoints/api/repository.py, add to existing repository endpoints
   @api_v1_bp.route('/repository/<path:repository>/pull_statistics')
   @parse_repository_name()
   @require_repo_read
   def get_repository_pull_statistics(namespace_name, repository_name):
       repository = model.repository.get_repository(namespace_name, repository_name)
       if not repository:
           raise NotFound()
           
       # Try Redis first, fallback to database
       pull_tracker = RedisPullTracker()
       stats = pull_tracker.get_repository_stats(repository.id)
       
       if not stats:
           # Fallback to database
           db_stats = model.pullstats.get_repository_pull_stats(repository)
           stats = db_stats
           
       return jsonify(stats)
   ```

**Complexity**: High  
**Difficulty**: Medium-High

**Pros**:
- Sub-millisecond write performance
- Atomic operations prevent race conditions
- Handles 5000 req/sec easily
- Configurable sync intervals
- Redis clustering for HA

**Cons**:
- Data loss risk between syncs
- Redis memory requirements
- Complex error handling
- Additional infrastructure dependency


## Manifest Digest Uniqueness & Database Design

### **Key Question: Is manifest_digest unique across repositories?**

**Answer: NO** - The same manifest digest can exist in multiple repositories.

**Why**: 
- Different repositories can contain identical images
- Example: `repo1/nginx:latest` and `repo2/nginx:latest` could have the same `sha256:abc123...`
- Manifest digest is only unique **within** a repository

**Database Evidence**:
```python
# data/database.py:1818 - Manifest table unique constraint
class Manifest(BaseModel):
    class Meta:
        indexes = (
            (("repository", "digest"), True),  # Unique constraint PER REPOSITORY
        )
```

### **Corrected Database Design for Pull Statistics**

```python
# CORRECTED: Must include repository_id for uniqueness
class PullStatistics(BaseModel):
    """
    Track pull statistics per manifest within each repository.
    Covers both tag and digest pulls efficiently.
    """
    repository = ForeignKeyField(Repository, index=True)
    manifest_digest = CharField(index=True)  # Not globally unique!
    last_pull_via_tag = CharField(null=True)  # Last tag used (if any)
    last_pull_date = DateTimeField(index=True)
    pull_count = BigIntegerField(default=0)
    tag_pull_count = BigIntegerField(default=0)  # Subset of total pulls
    
    class Meta:
        database = db
        read_only_config = read_only_config
        indexes = (
            (("repository", "manifest_digest"), True),  # ✅ CORRECT: Unique per repo
            (("repository", "last_pull_date"), False),  # For pruning queries
            (("manifest_digest",), False),  # For cross-repo digest queries
        )
```

**Example Scenario**:
```sql
-- Same digest in different repositories
| repository_id | manifest_digest  | pull_count |
|---------------|------------------|------------|
| 100          | sha256:abc123... | 50         |  # repo1/nginx
| 200          | sha256:abc123... | 25         |  # repo2/nginx

-- This is valid! Same image in different repos
```

## Recommended Implementation Approach

**Phase 1**: Implement Elasticsearch solution (Solution 1) for long-term historical data
**Phase 2**: Add Redis caching layer for real-time API responses
**Phase 3**: UI integration and auto-pruning rule engine

## Analysis Based on Updated Requirements (last-pull.md)

### Requirement Compliance Analysis

**Updated Requirements**:
1. ✅ Track last pull date per tag + update on tag pull
2. ✅ Track pull count per tag + increment on tag pull  
3. ✅ Track last pull date per manifest + update on tag OR digest pull
4. ✅ Track pull count per manifest + increment on tag OR digest pull
5. ✅ UI displays most recent pull date and overall pull count per tag
6. ✅ Must work for tags not pulled in years (historical data)
7. ✅ Support future auto-pruning policies based on pull count + timestamp

### Which Solution Best Handles "Years of Historical Data"?

**Solution 1 (Elasticsearch)**: ⭐ **BEST for Historical Data**
- **Pros**: Custom index prefix enables years-long retention
- **Storage**: Optimized for time-series data with daily indices
- **Querying**: Efficient range queries across years of data
- **Cost**: Lower storage cost for historical data (compressed, single replica)

**Solution 2 (Redis + DB)**: ❌ **Poor for Historical Data**  
- **Cons**: Redis TTL limits to ~30 days for performance
- **Database**: Would need to store years of pull records (huge growth)
- **Cost**: Expensive for storing every pull event in database

### Auto-Pruning Policy Support

Both solutions support pruning policies, but different approaches:

**Elasticsearch Approach**:
```python
# Query for tags to prune (not pulled in 6+ months, <10 pulls total)
GET /pullstats_tag_*/_search
{
  "query": {
    "bool": {
      "must": [
        {"range": {"datetime": {"lt": "now-6M"}}},
        {"term": {"repository_id": 123}}
      ]
    }
  },
  "aggs": {
    "tags_to_prune": {
      "terms": {"field": "metadata.tag_id"},
      "aggs": {
        "pull_count": {"value_count": {"field": "datetime"}},
        "last_pull": {"max": {"field": "datetime"}},
        "filter_low_usage": {
          "bucket_selector": {
            "buckets_path": {"count": "pull_count"},
            "script": "params.count < 10"
          }
        }
      }
    }
  }
}
```

**Database Approach** (if using Solution 2):
```python
# Simple SQL query for pruning
SELECT tag_id, last_pull_date, pull_count 
FROM pull_statistics 
WHERE repository_id = 123 
  AND last_pull_date < NOW() - INTERVAL 6 MONTH
  AND pull_count < 10
```

### Final Recommendation

**For Historical Data + Auto-Pruning**: **Solution 1 (Elasticsearch)**
- ✅ Handles years of historical data efficiently
- ✅ Custom retention policies per index type
- ✅ Time-series optimized storage and querying
- ✅ Complex aggregation queries for auto-pruning rules
- ✅ Existing infrastructure in Quay

**Implementation Priority**:
1. **Phase 1**: Implement Solution 1 with separate `pullstats_*` indices
2. **Phase 2**: Add Redis caching layer for real-time API responses
3. **Phase 3**: Build auto-pruning policy engine using ES aggregations

**Why Not Pure Redis Solution for Historical Requirements**:
- Redis TTL approach cannot store "years" of data efficiently
- Database storage of every pull event creates massive growth
- Elasticsearch is purpose-built for time-series data with long retention