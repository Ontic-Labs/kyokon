SELECT 
  CASE 
    WHEN description ~* '\braw\b' THEN 'raw'
    WHEN description ~* '\buncooked\b' THEN 'raw'
    WHEN description ~* '\bcooked\b' THEN 'cooked'
    WHEN description ~* '\broasted\b' THEN 'cooked'
    WHEN description ~* '\bgrilled\b' THEN 'cooked'
    WHEN description ~* '\bfried\b' THEN 'cooked'
    WHEN description ~* '\bbaked\b' THEN 'cooked'
    WHEN description ~* '\bsteamed\b' THEN 'cooked'
    WHEN description ~* '\bboiled\b' THEN 'cooked'
    WHEN description ~* '\bbraised\b' THEN 'cooked'
    WHEN description ~* '\bsmoked\b' THEN 'processed'
    WHEN description ~* '\bdried\b' THEN 'processed'
    WHEN description ~* '\bcanned\b' THEN 'processed'
    WHEN description ~* '\bfrozen\b' THEN 'processed'
    WHEN description ~* '\bpickled\b' THEN 'processed'
    WHEN description ~* '\bfermented\b' THEN 'processed'
    ELSE 'unspecified'
  END as state,
  COUNT(*) as cnt
FROM foods
GROUP BY 1
ORDER BY cnt DESC;
