ALTER TABLE `orderitem`
  DROP FOREIGN KEY `OrderItem_product_id_fkey`;

ALTER TABLE `orderitem`
  MODIFY COLUMN `product_id` INT NULL;

ALTER TABLE `orderitem`
  ADD CONSTRAINT `OrderItem_product_id_setnull_fkey`
  FOREIGN KEY (`product_id`)
  REFERENCES `product` (`id`)
  ON DELETE SET NULL
  ON UPDATE CASCADE;