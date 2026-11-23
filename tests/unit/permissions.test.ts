import { describe, expect, it } from 'vitest'
import { ALL_PERMISSIONS, can, isStaffRole, permissionsFor } from '../../shared/permissions'

describe('matriz de permisos (spec.md §1)', () => {
  it('admin puede todas las acciones', () => {
    expect(permissionsFor('admin')).toEqual(ALL_PERMISSIONS)
  })

  it('receptionist solo pierde la escritura de odontólogos/franjas y la gestión de Google', () => {
    const denied = ALL_PERMISSIONS.filter((permission) => !can('receptionist', permission))
    expect(denied.sort()).toEqual(['doctors.write', 'google.manage'])
  })

  it('receptionist puede operar citas y solicitudes', () => {
    for (const permission of ['appointments.create_phone', 'requests.decide', 'appointments.read', 'appointments.cancel_complete', 'google.status', 'sync.retry', 'system.status'] as const) {
      expect(can('receptionist', permission)).toBe(true)
    }
  })

  it('solo reconoce los roles admin y receptionist', () => {
    expect(isStaffRole('admin')).toBe(true)
    expect(isStaffRole('receptionist')).toBe(true)
    expect(isStaffRole('patient')).toBe(false)
    expect(isStaffRole(undefined)).toBe(false)
  })
})
