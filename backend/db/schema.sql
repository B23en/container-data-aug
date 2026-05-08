CREATE TABLE IF NOT EXISTS projects (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    target_spec TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS images (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id BIGINT REFERENCES images(id) ON DELETE SET NULL,
    folder_name TEXT,
    file_path TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    is_valid_path BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labels (
    id BIGSERIAL PRIMARY KEY,
    image_id BIGINT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    text_value TEXT,
    is_iso_valid BOOLEAN,
    is_manual BOOLEAN NOT NULL DEFAULT false,
    is_quality_passed BOOLEAN,
    bbox JSONB,
    confidence_score DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ocr_models (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT,
    weight_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS augmentation_tasks (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    model_id BIGINT REFERENCES ocr_models(id) ON DELETE SET NULL,
    status TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    resource_usage JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT augmentation_tasks_status_check
        CHECK (status IN ('PENDING', 'RUNNING', 'STOPPED', 'FAILED', 'DONE')),

    CONSTRAINT augmentation_tasks_progress_check
        CHECK (progress >= 0 AND progress <= 100)
);

CREATE TABLE IF NOT EXISTS augmentation_configs (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL UNIQUE REFERENCES augmentation_tasks(id) ON DELETE CASCADE,
    target_folder_name TEXT NOT NULL,
    applied_options JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS task_logs (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL REFERENCES augmentation_tasks(id) ON DELETE CASCADE,
    log_level TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT task_logs_log_level_check
        CHECK (log_level IN ('DEBUG', 'INFO', 'WARNING', 'ERROR'))
);

CREATE INDEX IF NOT EXISTS idx_images_project_id
    ON images(project_id);

CREATE INDEX IF NOT EXISTS idx_images_parent_id
    ON images(parent_id);

CREATE INDEX IF NOT EXISTS idx_labels_image_id
    ON labels(image_id);

CREATE INDEX IF NOT EXISTS idx_augmentation_tasks_project_id
    ON augmentation_tasks(project_id);

CREATE INDEX IF NOT EXISTS idx_augmentation_tasks_model_id
    ON augmentation_tasks(model_id);

CREATE INDEX IF NOT EXISTS idx_task_logs_task_id
    ON task_logs(task_id);
