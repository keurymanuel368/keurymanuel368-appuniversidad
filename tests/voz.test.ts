// La voz no debe leer signos ni etiquetas, y debe decir las horas como se habla.
import { describe, expect, it } from 'vitest';
import { speakable } from '../src/web/speech';

describe('speakable (texto para la voz)', () => {
  it('quita signos sueltos que el teléfono leería como «punto» o «coma»', () => {
    expect(speakable('.')).toBe('');
    expect(speakable(' , ')).toBe('');
    expect(speakable('Ok.. vamos, .')).toBe('Ok, vamos.');
  });
  it('quita la etiqueta «Respuesta:» del inicio', () => {
    expect(speakable('Respuesta: tienes dos tareas')).toBe('tienes dos tareas');
  });
  it('quita símbolos y emojis', () => {
    expect(speakable('Tienes 3 tareas: la de Física (mañana)...')).toBe('Tienes 3 tareas, la de Física mañana');
    expect(speakable('Listo ✅. ')).toBe('Listo.');
  });
  it('dice notas y horas como se habla', () => {
    expect(speakable('Sacaste 92.5/100')).toBe('Sacaste 92.5 de 100');
    expect(speakable('Vence a las 7:00 p. m.')).toBe('Vence a las 7 de la noche');
    expect(speakable('klk mano')).toBe('qué lo que mano');
  });
});
