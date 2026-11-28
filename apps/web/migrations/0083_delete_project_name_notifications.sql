CREATE TRIGGER project_name_deleted AFTER DELETE ON projects
BEGIN
  DELETE FROM project_name_notifications WHERE project_id = OLD.id;
END;
