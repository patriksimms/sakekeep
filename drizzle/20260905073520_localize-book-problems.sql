-- Old books keep their page references and problem codes. Details that were only
-- stored as English prose become available again after regeneration.
UPDATE books
SET generated_book = jsonb_set(generated_book, '{pages}', COALESCE((
  SELECT jsonb_agg(jsonb_set(page, '{problems}', COALESCE((
    SELECT jsonb_agg((problem - 'message') || jsonb_build_object('params', COALESCE(problem->'params', '{}'::jsonb)))
    FROM jsonb_array_elements(COALESCE(page->'problems', '[]'::jsonb)) problem
  ), '[]'::jsonb)) ORDER BY ordinal)
  FROM jsonb_array_elements(generated_book->'pages') WITH ORDINALITY AS pages(page, ordinal)
), '[]'::jsonb));
