# Pull Statistics Feature - Context for Next Session

## Project Overview
Implementing pull statistics tracking for Quay container registry to enable auto-pruning based on last pull date and pull count. Must handle ~5000 req/sec without overwhelming database CPU.

## Key Requirements (from last-pull.md)
1. Track last pull date per tag + update on tag pull
2. Track pull count per tag + increment on tag pull  
3. Track last pull date per manifest + update on tag OR digest pull
4. Track pull count per manifest + increment on tag OR digest pull
5. UI displays most recent pull date and overall pull count per tag
6. Must work for tags not pulled in YEARS (historical data)
7. Support future auto-pruning policies based on pull count + timestamp
8. Feature gated behind toggle
9. Database CPU already overwhelmed - minimize write operations

## Critical Technical Discoveries

### Tag-Manifest Relationship
- **One Tag → One Manifest**: Each tag points to exactly ONE manifest
- **One Manifest ← Many Tags**: Multiple tags can point to SAME manifest
- **Pull by tag**: Affects both tag count AND manifest count
- **Pull by digest**: ONLY affects manifest count (no specific tag affected)
- **Tag history**: When tags move, `lifetime_end_ms` set, new record created

### Manifest Digest Uniqueness Issue
**CRITICAL**: `manifest_digest` is NOT globally unique!
- Same digest can exist in multiple repositories
- Example: `repo1/nginx:latest` and `repo2/nginx:latest` → same `sha256:abc123`
- Database evidence: `(("repository", "digest"), True)` - unique constraint PER REPOSITORY
- **Fix**: PullStatistics must include `repository_id` in unique constraint

### Database Architecture
```python
class PullStatistics(BaseModel):
    repository = ForeignKeyField(Repository, index=True)
    manifest_digest = CharField(index=True)  # Not globally unique!
    last_pull_via_tag = CharField(null=True)
    last_pull_date = DateTimeField(index=True)
    pull_count = BigIntegerField(default=0)
    tag_pull_count = BigIntegerField(default=0)
    
    class Meta:
        indexes = (
            (("repository", "manifest_digest"), True),  # Unique per repository
        )
```

## Current Pull Code Flow Analysis
- **Pull by tag**: `fetch_manifest_by_tagname()` → `track_and_log("pull_repo", tag=manifest_ref)`
- **Pull by digest**: `fetch_manifest_by_digest()` → `track_and_log("pull_repo", manifest_digest=manifest_ref)`
- Current logging: `util/audit.py:93` → `logs_model.log_action()` → Database + Elasticsearch

## Solution Options Analyzed

### Solution 1: Elasticsearch Enhancement (RECOMMENDED)
- Extend existing logging with new LogEntryKind: `tag_pull_stat`, `manifest_pull_stat`
- Custom index prefix: `pullstats_*` with extended retention (years vs 30 days)
- Benefits: Handles historical data, existing infrastructure, time-series optimized
- Cons: 2-3 second ES indexing delay, complex aggregation queries

### Solution 2: Redis + Database Sync
- Redis for real-time stats, periodic database sync
- **MAJOR ISSUE**: Billion-scale data overwhelms both Redis memory AND database writes
- **Solution**: Time-window aggregation (5-minute buckets) → 99.7% write reduction

### Solution 3: Removed (In-Memory)
- Not suitable for multi-instance deployment and data persistence

## Scaling Challenge & Resolution

### The Problem
- 5000 req/sec = 300,000 database writes/minute
- Database CPU already overwhelmed with reads
- Redis memory: 1 billion events × 250 bytes = 250 GB (unrealistic)

### The Resolution  
**Hybrid Approach**: Redis (real-time) + Elasticsearch (bulk) + Database (aggregated)
```
Pull Event → Redis (1-hour TTL) → Elasticsearch (daily indices) → Database (daily aggregates)
           ↓                   ↓                              ↓
        API responses      Historical queries           Auto-pruning policies
```

**Benefits**:
- Redis: ~5-10 GB memory (bounded by TTL)
- Database: 0 real-time writes, daily aggregated updates only
- Elasticsearch: Existing high-volume infrastructure
- Supports years of historical data

## Files Modified/Created
- `plan.md`: Comprehensive implementation plan with code examples
- `quay_database_schema.jpeg`: Database ERD with focused pull stats diagram
- `pull_stats_focused_schema.jpeg`: Focused diagram for pull statistics tables
- `last-pull.md`: Updated requirements (user modified)

## Next Steps Priority
1. **Finalize architecture decision**: Elasticsearch vs Hybrid approach
2. **Update plan.md** with resolved scaling approach (aggregated writes)
3. **Create migration plan** for LogEntryKind additions
4. **Design API endpoints** for UI consumption
5. **Implement feature toggle** in features/__init__.py
6. **Create background worker** following QuotaRegistrySizeWorker pattern

## Key Questions for Next Session
1. Should we proceed with Elasticsearch-only approach or hybrid Redis+ES+DB?
2. How to handle Redis memory at billion scale - aggressive TTL vs sampling?
3. Database aggregation frequency - daily vs hourly sync?
4. UI real-time requirements - acceptable delay for pull stats display?

## Important Code Locations
- Manifest/Tag models: `data/database.py:1795, 1834`
- Pull handlers: `endpoints/v2/manifest.py:74, 148`
- Current logging: `util/audit.py:28`
- Elasticsearch: `data/logs_model/elastic_logs.py`
- Redis cache: `data/cache/redis_cache.py`
- Background workers: `workers/quotaregistrysizeworker.py` (pattern example)

## Technical Constraints Confirmed
- No modification to large Tag/Manifest tables (performance)
- Minimize database write operations (CPU constraint)
- Support historical data for years (retention requirement)
- Must handle 5000 req/sec sustained load
- Redis memory must be bounded and reasonable (<10 GB target)