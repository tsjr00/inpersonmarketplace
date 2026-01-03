\# Config-Driven Form Renderer Specification



This document defines how the application renders forms, validates input,

and persists data using vertical configuration files.



No vertical-specific logic may be hardcoded in the UI or backend.

All variation must be driven by config.



---



\## 1. Field Object Contract



Each field in a vertical config must support the following properties:



\- key (string, required)

\- label (string, required)

\- type (string, required)

\- required (boolean, default false)

\- default (optional)

\- options (array, required for select/multi\_select)

\- accept (array, file types)

\- help\_text (string, optional)

\- visibility (optional rule set)

\- validation (optional rule set)



The `key` is the canonical storage name and must not change once deployed.



---



\## 2. Supported Field Types



The renderer must support at minimum:



\- text

\- textarea

\- email

\- phone

\- address

\- select

\- multi\_select

\- boolean

\- date

\- date\_range

\- file



All field types must be renderable on mobile-first layouts.



---



\## 3. Rendering Rules



For each field:

1\. Display label

2\. Render input based on type

3\. Apply default value if present

4\. Apply required indicator

5\. Apply visibility rules

6\. Apply validation rules on change and on submit



Field order is determined by array order in the config file.



---



\## 4. Visibility Rules (Conditional Fields)



Fields may include a `visibility` object:



Example:

```json

"visibility": {

&nbsp; "depends\_on": "business\_type",

&nbsp; "equals": "Other"

}



