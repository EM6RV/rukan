-- المرحلة 2: القوالب الثمانية القديمة ← الستة الجديدة (نفس الألوان والمحتوى، تتغير القالب فقط)
UPDATE `stores` SET `template` = CASE `template`
  WHEN 'simple' THEN 'naqa'
  WHEN 'elegant' THEN 'makhmal'
  WHEN 'noir' THEN 'makhmal'
  WHEN 'bold' THEN 'nabd'
  WHEN 'pop' THEN 'nabd'
  WHEN 'warm' THEN 'hikaya'
  WHEN 'editorial' THEN 'lamsa'
  WHEN 'gallery' THEN 'lamsa'
  ELSE `template` END
WHERE `template` IN ('simple','elegant','noir','bold','pop','warm','editorial','gallery');
