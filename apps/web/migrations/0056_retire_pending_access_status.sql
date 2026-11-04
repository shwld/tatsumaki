UPDATE users SET access_status = 'allowed' WHERE access_status NOT IN ('allowed', 'blocked');
