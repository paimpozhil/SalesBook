-- CreateTable
CREATE TABLE `tenants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED', 'TRIAL') NOT NULL DEFAULT 'ACTIVE',
    `settings` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tenants_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenant_id` INTEGER NULL,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SALES_REP') NOT NULL DEFAULT 'SALES_REP',
    `status` ENUM('ACTIVE', 'INACTIVE', 'PENDING') NOT NULL DEFAULT 'ACTIVE',
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_tenant_id_idx`(`tenant_id`),
    INDEX `users_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `token` VARCHAR(500) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `refresh_tokens_token_key`(`token`),
    INDEX `refresh_tokens_user_id_idx`(`user_id`),
    INDEX `refresh_tokens_token_idx`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leads` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenant_id` INTEGER NOT NULL,
    `company_name` VARCHAR(255) NOT NULL,
    `website` VARCHAR(500) NULL,
    `industry` VARCHAR(100) NULL,
    `size` ENUM('MICRO', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE') NULL,
    `status` ENUM('NEW', 'CONTACTED', 'QUALIFIED', 'NEGOTIATION', 'CONVERTED', 'LOST') NOT NULL DEFAULT 'NEW',
    `source_id` INTEGER NULL,
    `tags` JSON NULL,
    `custom_fields` JSON NULL,
    `created_by` INTEGER NULL,
    `assigned_to` INTEGER NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `leads_tenant_id_idx`(`tenant_id`),
    INDEX `leads_status_idx`(`status`),
    INDEX `leads_source_id_idx`(`source_id`),
    INDEX `leads_created_by_idx`(`created_by`),
    INDEX `leads_assigned_to_idx`(`assigned_to`),
    INDEX `leads_company_name_idx`(`company_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contacts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenant_id` INTEGER NOT NULL,
    `lead_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NULL,
    `email` VARCHAR(255) NULL,
    `phone` VARCHAR(50) NULL,
    `position` VARCHAR(100) NULL,
    `is_primary` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `contacts_tenant_id_idx`(`tenant_id`),
    INDEX `contacts_lead_id_idx`(`lead_id`),
    INDEX `contacts_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `data_sources` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenant_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `type` ENUM('PLAYWRIGHT', 'API', 'RSS', 'MANUAL') NOT NULL,
    `url` VARCHAR(1000) NOT NULL,
    `config` JSON NOT NULL,
    `proxy_config` JSON NULL,
    `rate_limit` INTEGER NULL,
    `polling_frequency` VARCHAR(50) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_run_at` DATETIME(3) NULL,
    `last_status` ENUM('PENDING', 'RUNNING', 'SUCCESS', 'FAILED') NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `data_sources_tenant_id_idx`(`tenant_id`),
    INDEX `data_sources_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `data_source_runs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `data_source_id` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'RUNNING', 'SUCCESS', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `leads_found` INTEGER NOT NULL DEFAULT 0,
    `leads_created` INTEGER NOT NULL DEFAULT 0,
    `leads_updated` INTEGER NOT NULL DEFAULT 0,
    `error_message` TEXT NULL,
    `logs` LONGTEXT NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `data_source_runs_data_source_id_idx`(`data_source_id`),
    INDEX `data_source_runs_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `channel_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenant_id` INTEGER NOT NULL,
    `channel_type` ENUM('EMAIL_SMTP', 'EMAIL_API', 'SMS', 'WHATSAPP_WEB', 'WHATSAPP_BUSINESS', 'TELEGRAM', 'VOICE') NOT NULL,
    `provider` VARCHAR(50) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `credentials` JSON NOT NULL,
    `settings` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `channel_configs_tenant_id_idx`(`tenant_id`),
    INDEX `channel_configs_channel_type_idx`(`channel_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenant_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `channel_type` ENUM('EMAIL_SMTP', 'EMAIL_API', 'SMS', 'WHATSAPP_WEB', 'WHATSAPP_BUSINESS', 'TELEGRAM', 'VOICE') NOT NULL,
    `subject` VARCHAR(500) NULL,
    `body` LONGTEXT NOT NULL,
    `attachments` JSON NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `templates_tenant_id_idx`(`tenant_id`),
    INDEX `templates_channel_type_idx`(`channel_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaigns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenant_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `status` ENUM('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED') NOT NULL DEFAULT 'DRAFT',
    `type` ENUM('IMMEDIATE', 'SCHEDULED', 'SEQUENCE') NOT NULL DEFAULT 'IMMEDIATE',
    `target_filter` JSON NULL,
    `created_by` INTEGER NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `campaigns_tenant_id_idx`(`tenant_id`),
    INDEX `campaigns_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaign_steps` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `campaign_id` INTEGER NOT NULL,
    `step_order` INTEGER NOT NULL,
    `channel_type` ENUM('EMAIL_SMTP', 'EMAIL_API', 'SMS', 'WHATSAPP_WEB', 'WHATSAPP_BUSINESS', 'TELEGRAM', 'VOICE') NOT NULL,
    `channel_config_id` INTEGER NOT NULL,
    `template_id` INTEGER NOT NULL,
    `delay_days` INTEGER NOT NULL DEFAULT 0,
    `delay_hours` INTEGER NOT NULL DEFAULT 0,
    `send_time` VARCHAR(10) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `campaign_steps_campaign_id_idx`(`campaign_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaign_recipients` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `campaign_id` INTEGER NOT NULL,
    `lead_id` INTEGER NOT NULL,
    `contact_id` INTEGER NOT NULL,
    `current_step` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'UNSUBSCRIBED', 'REPLIED') NOT NULL DEFAULT 'PENDING',
    `next_action_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `campaign_recipients_campaign_id_idx`(`campaign_id`),
    INDEX `campaign_recipients_lead_id_idx`(`lead_id`),
    INDEX `campaign_recipients_status_idx`(`status`),
    INDEX `campaign_recipients_next_action_at_idx`(`next_action_at`),
    UNIQUE INDEX `campaign_recipients_campaign_id_lead_id_contact_id_key`(`campaign_id`, `lead_id`, `contact_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contact_attempts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenant_id` INTEGER NOT NULL,
    `lead_id` INTEGER NOT NULL,
    `contact_id` INTEGER NOT NULL,
    `campaign_id` INTEGER NULL,
    `campaign_step_id` INTEGER NULL,
    `channel_type` ENUM('EMAIL_SMTP', 'EMAIL_API', 'SMS', 'WHATSAPP_WEB', 'WHATSAPP_BUSINESS', 'TELEGRAM', 'VOICE') NOT NULL,
    `channel_config_id` INTEGER NOT NULL,
    `direction` ENUM('INBOUND', 'OUTBOUND') NOT NULL DEFAULT 'OUTBOUND',
    `status` ENUM('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED') NOT NULL DEFAULT 'PENDING',
    `subject` VARCHAR(500) NULL,
    `content` LONGTEXT NOT NULL,
    `external_id` VARCHAR(255) NULL,
    `metadata` JSON NULL,
    `sent_at` DATETIME(3) NULL,
    `delivered_at` DATETIME(3) NULL,
    `opened_at` DATETIME(3) NULL,
    `clicked_at` DATETIME(3) NULL,
    `replied_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `contact_attempts_tenant_id_idx`(`tenant_id`),
    INDEX `contact_attempts_lead_id_idx`(`lead_id`),
    INDEX `contact_attempts_contact_id_idx`(`contact_id`),
    INDEX `contact_attempts_campaign_id_idx`(`campaign_id`),
    INDEX `contact_attempts_status_idx`(`status`),
    INDEX `contact_attempts_external_id_idx`(`external_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenant_id` INTEGER NOT NULL,
    `lead_id` INTEGER NOT NULL,
    `contact_id` INTEGER NOT NULL,
    `channel_type` ENUM('EMAIL_SMTP', 'EMAIL_API', 'SMS', 'WHATSAPP_WEB', 'WHATSAPP_BUSINESS', 'TELEGRAM', 'VOICE') NOT NULL,
    `last_message_at` DATETIME(3) NULL,
    `status` ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `assigned_to` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `conversations_tenant_id_idx`(`tenant_id`),
    INDEX `conversations_lead_id_idx`(`lead_id`),
    INDEX `conversations_status_idx`(`status`),
    UNIQUE INDEX `conversations_tenant_id_lead_id_contact_id_channel_type_key`(`tenant_id`, `lead_id`, `contact_id`, `channel_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `messages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversation_id` INTEGER NOT NULL,
    `contact_attempt_id` INTEGER NULL,
    `direction` ENUM('INBOUND', 'OUTBOUND') NOT NULL,
    `content` LONGTEXT NOT NULL,
    `attachments` JSON NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `messages_conversation_id_idx`(`conversation_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_queue` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenant_id` INTEGER NULL,
    `type` ENUM('SCRAPE', 'CAMPAIGN_STEP', 'POLL', 'WEBHOOK', 'CLEANUP', 'EMAIL_SEND', 'SMS_SEND') NOT NULL,
    `payload` JSON NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 5,
    `status` ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRY') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `max_attempts` INTEGER NOT NULL DEFAULT 3,
    `scheduled_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `error_message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `job_queue_tenant_id_idx`(`tenant_id`),
    INDEX `job_queue_status_idx`(`status`),
    INDEX `job_queue_scheduled_at_idx`(`scheduled_at`),
    INDEX `job_queue_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `analytics_daily` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenant_id` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `channel_type` ENUM('EMAIL_SMTP', 'EMAIL_API', 'SMS', 'WHATSAPP_WEB', 'WHATSAPP_BUSINESS', 'TELEGRAM', 'VOICE') NOT NULL,
    `campaign_id` INTEGER NULL,
    `sent_count` INTEGER NOT NULL DEFAULT 0,
    `delivered_count` INTEGER NOT NULL DEFAULT 0,
    `opened_count` INTEGER NOT NULL DEFAULT 0,
    `clicked_count` INTEGER NOT NULL DEFAULT 0,
    `replied_count` INTEGER NOT NULL DEFAULT 0,
    `bounced_count` INTEGER NOT NULL DEFAULT 0,
    `failed_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `analytics_daily_tenant_id_idx`(`tenant_id`),
    INDEX `analytics_daily_date_idx`(`date`),
    UNIQUE INDEX `analytics_daily_tenant_id_date_channel_type_campaign_id_key`(`tenant_id`, `date`, `channel_type`, `campaign_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_assigned_to_fkey` FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `data_sources` ADD CONSTRAINT `data_sources_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `data_source_runs` ADD CONSTRAINT `data_source_runs_data_source_id_fkey` FOREIGN KEY (`data_source_id`) REFERENCES `data_sources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `channel_configs` ADD CONSTRAINT `channel_configs_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `templates` ADD CONSTRAINT `templates_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `templates` ADD CONSTRAINT `templates_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_steps` ADD CONSTRAINT `campaign_steps_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_steps` ADD CONSTRAINT `campaign_steps_channel_config_id_fkey` FOREIGN KEY (`channel_config_id`) REFERENCES `channel_configs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_steps` ADD CONSTRAINT `campaign_steps_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_recipients` ADD CONSTRAINT `campaign_recipients_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_recipients` ADD CONSTRAINT `campaign_recipients_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_recipients` ADD CONSTRAINT `campaign_recipients_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contact_attempts` ADD CONSTRAINT `contact_attempts_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contact_attempts` ADD CONSTRAINT `contact_attempts_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contact_attempts` ADD CONSTRAINT `contact_attempts_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contact_attempts` ADD CONSTRAINT `contact_attempts_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contact_attempts` ADD CONSTRAINT `contact_attempts_campaign_step_id_fkey` FOREIGN KEY (`campaign_step_id`) REFERENCES `campaign_steps`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contact_attempts` ADD CONSTRAINT `contact_attempts_channel_config_id_fkey` FOREIGN KEY (`channel_config_id`) REFERENCES `channel_configs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_assigned_to_fkey` FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_contact_attempt_id_fkey` FOREIGN KEY (`contact_attempt_id`) REFERENCES `contact_attempts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_queue` ADD CONSTRAINT `job_queue_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `analytics_daily` ADD CONSTRAINT `analytics_daily_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `analytics_daily` ADD CONSTRAINT `analytics_daily_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
