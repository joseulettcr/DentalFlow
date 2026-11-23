// Matriz de permisos del personal (spec.md §1). Fuente única compartida por el backend (que la APLICA)
// y el frontend (que solo la usa para mostrar opciones; nunca es una barrera de seguridad).

export const STAFF_ROLES = ['admin', 'receptionist'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value)
}

export const PERMISSIONS = {
  'appointments.create_phone': { label: 'Crear cita telefónica directa', roles: ['admin', 'receptionist'] },
  'requests.decide': { label: 'Listar, aprobar o rechazar solicitudes', roles: ['admin', 'receptionist'] },
  'appointments.read': { label: 'Listar y consultar citas', roles: ['admin', 'receptionist'] },
  'appointments.cancel_complete': { label: 'Cancelar o completar citas', roles: ['admin', 'receptionist'] },
  'doctors.read': { label: 'Ver odontólogos y franjas', roles: ['admin', 'receptionist'] },
  'doctors.write': { label: 'Crear o editar odontólogos y franjas', roles: ['admin'] },
  'google.manage': { label: 'Conectar o desconectar Google Calendar', roles: ['admin'] },
  'google.status': { label: 'Ver estado de Google y sincronización', roles: ['admin', 'receptionist'] },
  'sync.retry': { label: 'Reintentar sincronización de una cita', roles: ['admin', 'receptionist'] },
  'system.status': { label: 'Recordatorios simulados y estado del sistema', roles: ['admin', 'receptionist'] },
} as const satisfies Record<string, { label: string; roles: readonly StaffRole[] }>

export type Permission = keyof typeof PERMISSIONS

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[]

export function can(role: StaffRole, permission: Permission): boolean {
  return (PERMISSIONS[permission].roles as readonly StaffRole[]).includes(role)
}

export function permissionsFor(role: StaffRole): Permission[] {
  return ALL_PERMISSIONS.filter((permission) => can(role, permission))
}
