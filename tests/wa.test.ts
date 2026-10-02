// Formato de los avisos por WhatsApp.
import { describe, expect, it } from 'vitest';
import { blocks, courseLabel, money, timeLeft } from '../src/worker/wa';

describe('formato de WhatsApp', () => {
  it('usa el nombre de la asignatura cuando el nombre corto es un código del EVA', () => {
    expect(courseLabel('Comunicación Oral y Escrita', '202633-CBE109-HV4')).toBe('Comunicación Oral y Escrita');
    expect(courseLabel('Tecnología de la Información', 'Tecnología')).toBe('Tecnología');
    expect(courseLabel('Orientación a la Educación a Distancia Virtual', null)).toBe('Orientación a la Educación a…');
    expect(courseLabel(null, null)).toBe('');
  });

  it('formatea montos en pesos', () => {
    expect(money('6500')).toBe('RD$ 6,500');
    expect(money(12500.5)).toBe('RD$ 12,500.5');
    expect(money('a convenir')).toBe('RD$ a convenir');
  });

  it('dice cuánto falta', () => {
    expect(timeLeft(1000 + 40 * 60, 1000)).toBe('faltan 40 minutos');
    expect(timeLeft(1000 + 3600, 1000)).toBe('falta 1 hora');
    expect(timeLeft(1000 + 3 * 3600, 1000)).toBe('faltan 3 horas');
    expect(timeLeft(1000 + 3 * 86400, 1000)).toBe('faltan 3 días');
    expect(timeLeft(900, 1000)).toBe('ya venció');
  });

  it('une bloques con una línea en blanco y salta los vacíos', () => {
    expect(blocks('📌 *Título*', '', false, 'cuerpo')).toBe('📌 *Título*\n\ncuerpo');
  });
});
