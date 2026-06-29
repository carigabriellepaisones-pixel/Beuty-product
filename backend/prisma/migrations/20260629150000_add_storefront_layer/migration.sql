-- Non-destructive: add storefront layer assignment to Product
ALTER TABLE `Product`
ADD COLUMN `storefront_layer` TINYINT NOT NULL DEFAULT 1;
