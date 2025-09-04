Goal: Provide insight into popularity of an image tag by recording the last pull date so that auto-pruning rules can be created that prune based on the least recently pulled images.

Background: Currently, users have little to no insight into when an image tag was last pulled. This information is needed to decide whether it is safe to delete a tag as part of cleaning up the repository. We currently record pull events in the audit logs, but these are expensive to query and sometimes do not allow querying at all.

Acceptance criteria:

for each individual image tag, Quay keeps a record of the last pull date and updates it on pull via the tag
for each individual image tag, Quay keeps a pull count and increments it on pull via the tag
for each individual image tag, Quay also maintains a record of the last pull date of the associated manifest and updates it on pull via tag or pull via digest
for each individual image tag, Quay also maintains a pull count the associated manifest and incrmeents it on pull via tag or pull via digest
the UI displays the most recent pull date and overall pull count for each image tag
a pull event is interpreted in the same way / with the same conditions as currently logging the pull event in the audit logs
it is acceptable for the pull activity to be temporarily stored in an in-memory cache like Redis or memcached and periodically synced to the database
it is acceptable for only a specific in-memory stored to be required in order to support pull activity tracking (e.g. Redis due to its concurrency / integrity feature)
this feature should be gated behind a feature toggle
Note: the soltuoin should work for storing last timestamps for tags that havent been pulled in years too. And it should support adding new tag pruning policy based on pull count and last timestamp. Ignore about the priuning policy implelmantion, but just ensure that the solution should allow easy adding pruining policy. 

can you create a plan.md that gives a diffrerent ways to acheive the above. Note that the solution should support large database as quay.io gets close 5000 req/sec and having write ops on every pull to db isn't ideal since CPU is already overwhelmend with the read requests. Give complexity and difficult implementing for each solution with detailed steps on what the change would look like along with pros and cons. Also analyse two of my solutions:

1. Using already existing usage logs which records last timestapm for every pull. I think the usage log supports 4 different log model. Eg: look at lookup_latest_logs() in table_logs_model.py - can i use this to acheive both last timestamp on pull and pull count? There is a couple of seconds in getting the UI to show the timestamp - can you also tell me what the code flow look like for elactic search


2. the other option is to use already existing redis. but dont know what the solution would look like. This would involve createing a separate table which stores uniquely digest and timestamp and is sued to render in UI and eventually update the primary db. not sure how redis would be involved here.


3. Can you clarify what does it mean to track pull count for tag vs manifest in quay codebase? what should I look for? and does tracking one track other? how does the db schema look like