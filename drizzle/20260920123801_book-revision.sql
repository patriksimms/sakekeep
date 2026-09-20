-- Books stored before optimistic concurrency have no revision. Start them at 0 so the first
-- save from a client that already loaded them is accepted.
UPDATE books
SET generated_book = jsonb_set(generated_book, '{revision}', '0'::jsonb)
WHERE generated_book->'revision' IS NULL;
