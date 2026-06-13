-- Migration: Add release_date column to stories for release-type stories
ALTER TABLE stories ADD COLUMN release_date text;
