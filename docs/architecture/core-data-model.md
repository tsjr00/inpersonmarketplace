\# Core Data Model (Vertical-Agnostic)



These entities are shared across all marketplace verticals.

Vertical differences are handled via configuration, not schema forks.



\## User

\- id

\- email

\- phone

\- display\_name

\- roles (buyer, vendor, admin, verifier)

\- created\_at

\- updated\_at



\## Organization (optional)

\- id

\- legal\_name

\- dba\_name

\- owner\_user\_id

\- created\_at

\- updated\_at



\## VendorProfile

\- id

\- user\_id or organization\_id

\- vertical\_id

\- status (draft, submitted, approved, rejected, suspended)

\- profile\_data (JSON from vertical config)

\- verification\_status

\- created\_at

\- updated\_at



\## Listing

\- id

\- vendor\_profile\_id

\- vertical\_id

\- status (draft, published, paused, archived)

\- listing\_data (JSON from vertical config)

\- created\_at

\- updated\_at



\## Transaction

\- id

\- listing\_id

\- vendor\_profile\_id

\- buyer\_user\_id

\- vertical\_id

\- status (initiated, accepted, declined, canceled, fulfilled, expired)

\- buyer\_data (JSON from vertical config)

\- created\_at

\- updated\_at



\## Fulfillment

\- id

\- transaction\_id

\- mode (pickup, delivery, meetup)

\- status (pending, confirmed, completed, failed)

\- confirmed\_at



