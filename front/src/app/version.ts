/**
 * Versión del Front (análisis 005). El dispositivo checador la manda en su
 * latido y la compara con la que anuncia el servidor (`FRONT_VERSION` en el
 * .env del Back): si son distintas, se recarga solo en un momento sin uso.
 * Subirla en cada entrega que cambie el checador.
 */
export const VERSION_FRONT = '0.5.0';
