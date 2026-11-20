// Los topes de una subida, en un archivo propio: los usan la subida, el controlador (multer) y el aviso de la demo.
export const MAX_BYTES = 5 * 1024 * 1024; // el mismo 5 MB del contrato y del CHECK de la base
export const MAX_FILES_PER_ACCOUNT = 10; // a la vez; el cupo de 24 h de la demo es otro (demo/demo.service.ts)
