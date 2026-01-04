# Data Directory

This directory is for:
- Uploaded documents (vendor verification files)
- Exported reports
- Database backups
- Temporary file processing

**NOT for application data storage** - use Supabase database instead.

## Structure

```
data/
├── README.md      # This file
├── .gitkeep       # Keeps directory in git
├── uploads/       # User uploaded files (future)
├── exports/       # Generated reports (future)
└── backups/       # Database backups (future)
```

## Notes

- Files in this directory are gitignored (except README.md and .gitkeep)
- Uploaded files should be stored in Supabase Storage in production
- This local directory is for development/testing only
