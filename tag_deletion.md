 Based on my analysis of the Quay codebase, here's what gets cached in RedisDataModelCache and how tag cleanup works:

  What's Cached in RedisDataModelCache

  RedisDataModelCache caches these data model objects:

  1. Repository lookups - repository_lookup_{namespace}_{repo}_{manifest_ref}_{kind_filter} (120s TTL)
  2. Repository manifests - repository_manifest__{repo_id}_{digest} (300s TTL)
  3. Active repository tags - repo_active_tags__{repo_id}_{last_tag}_{limit} (120s TTL)
  4. Repository blobs - repo_blob__{namespace}_{repo}_{digest}_{version} (60s TTL)
  5. Catalog pages - catalog_page__{auth_context}_{start_id}_{limit} (60s TTL)
  6. Geo restrictions - geo_restrictions__{namespace} (240s TTL)
  7. Security reports - security_report__{digest} (300s TTL)
  8. Manifest referrers - manifest_referrers__{repo_id}_{manifest_digest} (60s TTL)
  9. Upstream registry tokens - upstream_token__{org}/{registry}/{repo} (variable TTL)

  Tag Cleanup Process

  When a tag is deleted:

  1. Tag deletion (delete_tag in data/model/oci/tag.py:478):
    - Sets lifetime_end_ms to current timestamp (marks as expired)
    - Cleans up notifications for tag expiry via delete_tag_notifications_for_tag()
    - Resets child manifest expiration via reset_child_manifest_expiration()
  2. What happens to the associated manifest:
    - Manifest is NOT immediately deleted - only the tag pointing to it expires
    - Child manifests get their temporary tags reset to expire immediately
    - Manifest becomes a garbage collection candidate if no other alive tags point to it
    - Actual manifest deletion happens during garbage collection runs
  3. Time machine recovery:
    - Deleted tags remain recoverable for namespace.removed_tag_expiration_s seconds
    - After this window, tags become permanently unrecoverable
    - PERMANENTLY_DELETE_TAGS config controls final deletion behavior
  4. Garbage collection:
    - find_repository_with_garbage() identifies repositories with expired tags past recovery window
    - Manifests without any alive tags pointing to them get cleaned up
    - Child manifests (layers, config) also get garbage collected if unreferenced

  Key point: Tag deletion is a soft delete - the manifest persists until garbage collection runs and confirms no other tags reference it.
  



⏺ Based on my analysis of the Quay codebase, here's the complete flow for tag deletion and garbage collection:

  Who Deletes Tags Initially

  Tags are deleted by users through these endpoints:

  1. V1 API: DELETE /v1/repositories/<repo>/tags/<tag> → endpoints/v1/tag.py:125
  2. V2 API: DELETE /v1/repository/<repo>/tag/<tag> → endpoints/api/tag.py:242
  3. Time Machine Delete: TagTimeMachineDelete API endpoint

  Call Flow for Tag Deletion:
  User Request → API Endpoint → registry_model.delete_tag() → model.oci.tag.delete_tag() → _delete_tag()

  Garbage Collection Flow

  1. Tag becomes GC candidate (data/model/oci/tag.py:478-508):

  def delete_tag(repository_id, tag_name):
      # Soft delete - sets lifetime_end_ms to current timestamp
      tag = get_tag(repository_id, tag_name)
      return _delete_tag(tag, get_epoch_timestamp_ms())

  def _delete_tag(tag, now_ms):
      with db_transaction():
          delete_tag_notifications_for_tag(tag)  # Clean up notifications
          Tag.update(lifetime_end_ms=now_ms).where(Tag.id == tag.id).execute()
          reset_child_manifest_expiration(tag.repository, tag.manifest)  # Mark child manifests for GC

  2. GC Worker finds repositories with garbage (workers/gc/gcworker.py:44-78):

  def _garbage_collection_repos():
      policy = get_random_gc_policy()  # Get namespace GC policy (e.g., 7 days)
      repo_ref = registry_model.find_repository_with_garbage(policy)  # Find repo with expired tags
      if repo_ref:
          garbage_collect_repo(repository)  # Start GC process

  3. Find repositories with expired tags (data/model/oci/tag.py:650-687):

  def find_repository_with_garbage(limit_to_gc_policy_s):
      expiration_timestamp = get_epoch_timestamp_ms() - (limit_to_gc_policy_s * 1000)
      # Find repos with tags expired beyond recovery window
      return repositories with Tag.lifetime_end_ms <= expiration_timestamp

  4. Repository garbage collection (data/model/gc.py:258-289):

  def garbage_collect_repo(repo):
      # Find unrecoverable tags (expired + past time machine window)
      for tags in oci_tag.lookup_unrecoverable_tags(repo):
          context = _GarbageCollectorContext(repo)
          for tag in tags:
              _purge_oci_tag(tag, context)  # Add manifest to GC context
          _run_garbage_collection(context)  # Run iterative GC

  5. Manifest becomes GC candidate (data/model/gc.py:325-352):

  def _purge_oci_tag(tag, context):
      context.add_manifest_id(tag.manifest_id)  # Add manifest to GC context
      delete_tag_notifications_for_tag(tag)
      tag.delete_instance()  # Actually delete the tag row

  6. Manifest deletion during GC (data/model/gc.py:398-503):

  def _garbage_collect_manifest(manifest_id, context):
      if _check_manifest_used(manifest_id):  # Check if any alive tags reference it
          return False

      # Add all manifest components to GC context
      for manifest_blob in ManifestBlob.select().where(ManifestBlob.manifest == manifest_id):
          context.add_blob_id(manifest_blob.blob_id)  # Blobs for deletion

      for connector in ManifestChild.select().where(ManifestChild.manifest == manifest_id):
          context.add_manifest_id(connector.child_manifest_id)  # Child manifests

      # Delete manifest and related data
      manifest.delete_instance()
      secscan_model.garbage_collect_manifest_report(manifest.digest)  # Clean security reports

  7. Check if manifest is still used (data/model/gc.py:365-395):

  def _check_manifest_used(manifest_id):
      # Check if manifest referenced by alive tags
      if Tag.select().where(Tag.manifest == manifest_id).exists():
          return True

      # Check if manifest is child of another manifest  
      if ManifestChild.select().where(ManifestChild.child_manifest == manifest_id).exists():
          return True

      # Check if manifest is subject of another manifest (referrers)
      if Manifest.select().join(Referrer, on=(Manifest.digest == Referrer.subject)).where(Manifest.id == manifest_id).exists():
          return True

      return False

  Key Function Call Chain

  Tag Deletion → Manifest GC:
  1. delete_tag() → marks tag as expired
  2. GarbageCollectionWorker._garbage_collection_repos() → runs every 30s
  3. find_repository_with_garbage() → finds repos with expired tags
  4. garbage_collect_repo() → processes repository
  5. _purge_oci_tag() → adds manifest to GC context
  6. _garbage_collect_manifest() → checks if manifest still used
  7. _check_manifest_used() → verifies no alive tags reference manifest
  8. Manifest deleted if no references found

  The manifest survives until GC confirms no other alive tags point to it.