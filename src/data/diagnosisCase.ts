/**
 * RED-TIC · Instrumento de diagnóstico (Fase 5) — contenido del caso.
 *
 * Dos versiones equivalentes, no idénticas:
 *  - `pre`  → biblioteca del barrio (aplicación inicial, línea base).
 *  - `post` → actividad municipal (cierre / postest paralelo, NO validado aún).
 *
 * Todo es ficticio y está rotulado como *simulación*. Ningún enlace es activo y
 * nunca se pide una contraseña real.
 */

export type DiagnosisKind = 'pre' | 'post'

export interface SourceFicha {
  /** Identificador visible: «Fuente A» / «Fuente B». */
  label: string
  /** Encabezado de la ficha (sitio, foro, etc.). */
  heading: string
  /** Rótulo de procedencia: oficial / anónima. */
  provenance: string
  /** Líneas de contenido de la ficha. */
  lines: string[]
  /** Marca si la ficha incluye un enlace simulado (no activo). */
  simulatedLink?: string
}

export interface SuspiciousMessage {
  from: string
  subject: string
  body: string
  /** Enlace mostrado como texto, sin `href`: nunca es clicable. */
  simulatedLink: string
}

export interface DiagnosisCase {
  kind: DiagnosisKind
  title: string
  summary: string
  /** Rótulo de la prueba, siempre como simulación. */
  disclaimer: string
  sources: [SourceFicha, SourceFicha]
  message: SuspiciousMessage
  /** Plantilla de «carpeta de fuentes» sugerida al estudiante. */
  folderTemplate: string[]
  /** Boceto de instrucciones del equipo. */
  instructions: string[]
}

export interface DiagnosisTask {
  code: 'T1' | 'T2' | 'T3' | 'T4' | 'T5'
  title: string
  /** Consigna literal de Fase 5. */
  prompt: string
  /** Indicador prioritario (D1, D3, D4, D5, E1). */
  indicator: string
}

/** Consignas T1–T5 (idénticas en la versión previa y la paralela). */
export const DIAGNOSIS_TASKS: DiagnosisTask[] = [
  {
    code: 'T1',
    title: 'Buscar y contrastar',
    prompt:
      'Escribe una búsqueda útil para conocer el procedimiento. Compara las fichas A y B; elige qué información usarías y anota dos motivos y algo que confirmarías.',
    indicator: 'D1',
  },
  {
    code: 'T2',
    title: 'Decidir con seguridad',
    prompt:
      'Lee el mensaje. Explica qué harías antes de abrir el enlace, qué dato no entregarías y a quién consultarías si dudas.',
    indicator: 'D4',
  },
  {
    code: 'T3',
    title: 'Explicar para otra persona',
    prompt:
      'Redacta o graba tres pasos para reservar, usando solo la información que consideras confiable. Añade una forma de ayuda si la persona no puede completar un paso.',
    indicator: 'D3',
  },
  {
    code: 'T4',
    title: 'Resolver una dificultad',
    prompt:
      'La persona no encuentra el botón de reserva. Propón dos acciones posibles, elige una para probar primero y explica cómo sabrías si funcionó.',
    indicator: 'D5',
  },
  {
    code: 'T5',
    title: 'Formular necesidad',
    prompt:
      'Escribe una pregunta que le harías a la persona antes de diseñar una guía definitiva. Distingue lo que ya sabes de lo que supones.',
    indicator: 'E1',
  },
]

const COMMON_INSTRUCTIONS = [
  'No hay pistas: usa las fichas y tu criterio.',
  'Puedes pedir ayuda; quedará registrada como apoyo.',
  'Puedes dejar en blanco lo que no desees responder.',
]

const PRE_CASE: DiagnosisCase = {
  kind: 'pre',
  title: 'La guía de reservas de la biblioteca',
  summary:
    'La biblioteca del barrio quiere preparar una guía para que sus visitantes reserven una actividad cultural en línea. Una persona recibe además un mensaje que promete acelerar la reserva si entra a un enlace y escribe su contraseña. El equipo debe encontrar información, decidir qué compartir y explicar la reserva de manera clara.',
  disclaimer: 'Fichas y mensaje simulados para la prueba. No uses cuentas ni contraseñas reales.',
  sources: [
    {
      label: 'Fuente A',
      heading: 'Biblioteca del Barrio Los Aromos — página oficial',
      provenance: 'Sitio institucional (simulación)',
      lines: [
        'Reserva de actividades culturales.',
        'Encargada de la biblioteca: Sra. Marta Ibáñez (ficticia).',
        'Última actualización: 3 de mayo de 2026.',
        'Horario de atención: martes a sábado, de 15:00 a 19:00.',
        'Procedimiento: crea tu cuenta con un correo personal, elige la actividad y confirma el cupo. La reserva es gratuita y se confirma en el mismo sitio.',
        'Si tienes problemas, escribe a contacto@losaromos.example o consulta en el mesón.',
      ],
    },
    {
      label: 'Fuente B',
      heading: 'Foro «Actividades YA» — publicación anónima',
      provenance: 'Foro público sin responsable (simulación)',
      lines: [
        '¿Quieres reservar rápido en la biblioteca?',
        'Publicado por: Anónimo. Sin fecha.',
        'Para asegurar tu cupo hay que pagar una reserva de $2.000 y confirmar por WhatsApp antes de 24 horas.',
        'Si no pagas, tu cupo se libera y pierdes la actividad.',
      ],
      simulatedLink: 'reserva-actividades.example/pago',
    },
  ],
  message: {
    from: 'reservas-biblioteca@correo-urgente.example',
    subject: '¡Últimos cupos! Activa tu reserva ahora',
    body:
      'Estimado visitante: la biblioteca liberó cupos por 24 horas. Para asegurar tu lugar entra al enlace y escribe tu usuario y contraseña. Si no lo haces, perderás tu cupo. Responde este correo con tus datos.',
    simulatedLink: 'reserva-rapida.example/ingreso',
  },
  folderTemplate: [
    'Autor o responsable de la información',
    'Fecha de publicación',
    'Afirmación principal',
    'Qué puedo confirmar',
    'Qué me hace dudar',
  ],
  instructions: COMMON_INSTRUCTIONS,
}

const POST_CASE: DiagnosisCase = {
  kind: 'post',
  title: 'La reserva del cupo municipal',
  summary:
    'La municipalidad quiere preparar una guía para reservar un cupo en una actividad cultural en línea. Una persona recibe además un aviso que promete confirmar el cupo si entrega un código de tarjeta. El equipo debe encontrar información, decidir qué compartir y explicar la reserva de manera clara.',
  disclaimer: 'Versión paralela simulada (postest). No usa datos, cuentas ni pagos reales.',
  sources: [
    {
      label: 'Fuente A',
      heading: 'Municipalidad de Puerto Claro — sitio oficial',
      provenance: 'Sitio institucional (simulación)',
      lines: [
        'Reserva de cupos en actividades culturales.',
        'Responsable: Dirección de Cultura (ficticia).',
        'Última actualización: 12 de agosto de 2026.',
        'Horario de atención: lunes a viernes, de 9:00 a 17:00.',
        'Procedimiento: ingresa con tu correo, elige la actividad y confirma el cupo. La reserva es gratuita y se confirma en el mismo sitio.',
        'Si tienes problemas, escribe a cultura@puertoclaro.example o consulta en la oficina.',
      ],
    },
    {
      label: 'Fuente B',
      heading: 'Grupo de vecinos «Cupos Ya» — publicación anónima',
      provenance: 'Grupo sin responsable identificable (simulación)',
      lines: [
        '¿Quieres tu cupo municipal sin filas?',
        'Publicado por: Anónimo. Sin fecha.',
        'Para confirmar el cupo debes transferir $3.000 y enviar la foto de tu carnet por mensaje directo.',
        'Los cupos se agotan; solo para quienes transfieren hoy.',
      ],
      simulatedLink: 'cupos-ya.example/transferir',
    },
  ],
  message: {
    from: 'municipio-cupos@aviso-express.example',
    subject: 'Confirma tu cupo municipal en minutos',
    body:
      'Buenas tardes: para confirmar tu cupo en la actividad municipal, responde con el código de 16 dígitos de tu tarjeta y tu clave de cajero. Solo así reservamos tu lugar antes de que se agote.',
    simulatedLink: 'confirma-cupo.example/clave',
  },
  folderTemplate: [
    'Autor o responsable de la información',
    'Fecha de publicación',
    'Afirmación principal',
    'Qué puedo confirmar',
    'Qué me hace dudar',
  ],
  instructions: COMMON_INSTRUCTIONS,
}

export const DIAGNOSIS_CASES: Record<DiagnosisKind, DiagnosisCase> = {
  pre: PRE_CASE,
  post: POST_CASE,
}

export function diagnosisCaseFor(kind: DiagnosisKind): DiagnosisCase {
  return DIAGNOSIS_CASES[kind] ?? PRE_CASE
}
