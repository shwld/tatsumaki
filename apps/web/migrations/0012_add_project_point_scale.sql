-- Migration: Add point scale configuration to projects
ALTER TABLE projects ADD COLUMN point_scale_type TEXT NOT NULL DEFAULT 'fibonacci';
ALTER TABLE projects ADD COLUMN custom_point_scale TEXT;
