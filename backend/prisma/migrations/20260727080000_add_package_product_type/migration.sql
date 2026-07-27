-- Non-destructive: add PACKAGE as a valid ProductType value
ALTER TYPE "ProductType" ADD VALUE IF NOT EXISTS 'PACKAGE';
