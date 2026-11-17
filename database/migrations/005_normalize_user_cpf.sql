UPDATE usuarios
SET cpf = regexp_replace(cpf, '\\D', '', 'g')
WHERE cpf ~ '\\D';
