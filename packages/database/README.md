# Database Module

### Development

Generate dev client
- Update `prisma.schema`
- Run `yarn db:generate`

Generate dev migration
- Update `prisma.schema`
- Run `yarn db:migrate`
- Enter a migration name
- A migration file will be created based on the difference between the current Prisma schema and the latest database schema
- The migration will NOT be automatically applied to the database due to the `--create-only` flag

Reset dev database
- Run `yarn db:push`
