# Database Module

### Development

This module equips with a set of scripts on top of Prisma's native db migration commands for better migration management.

Generate dev client
- Update `prisma.schema`
- Run `yarn db:generate`

Generate dev migration
- Update `prisma.schema`
- Run `yarn db:create-migration`
- Enter a migration name
- Both up and down migration files will be created automatically
- Update the migration file as needed
- Apply the migration by `yarn db:deploy`
- The local schema snapshot will also be updated

Rollback a migration
- Run `yarn db:rollback` will revert the last migration both locally and in the database
