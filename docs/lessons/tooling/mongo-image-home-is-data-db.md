# The mongo image's HOME is /data/db

`mongo:7` sets `HOME=/data/db`, and its entrypoint chowns everything under
`/data/db` while mongod starts. `docker exec <container> mongosh …` writes
`$HOME/.mongodb/mongosh/*.lock` there; when the chown reaches the lock after
mongosh deleted it, the entrypoint fails with
`chown: cannot access '/data/db/.mongodb/mongosh/…lock'` and the container
exits — a readiness probe killed the database it was waiting for (CI run
38918513740, E2E shard 1 of PR #885). Run every `docker exec … mongosh` with
`-e HOME=/tmp`.
