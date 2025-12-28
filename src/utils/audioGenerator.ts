/**
 * Audio generator utility for creating notification sounds using Web Audio API
 * Provides fallback sounds when audio files are not available
 */

export interface ToneConfig {
  frequency: number;
  duration: number;
  type: OscillatorType;
  fadeOut?: boolean;
  harmonics?: number[];
}

// Predefined tone configurations
export const TONE_CONFIGS: Record<string, ToneConfig> = {
  default: {
    frequency: 880,
    duration: 0.15,
    type: 'sine',
    fadeOut: true,
  },
  chime: {
    frequency: 1047, // C6
    duration: 0.4,
    type: 'sine',
    fadeOut: true,
    harmonics: [1320, 1568], // E6, G6 - makes a chord
  },
  pop: {
    frequency: 600,
    duration: 0.08,
    type: 'sine',
    fadeOut: true,
  },
  bell: {
    frequency: 1200,
    duration: 0.6,
    type: 'sine',
    fadeOut: true,
    harmonics: [2400, 3600],
  },
  ding: {
    frequency: 1500,
    duration: 0.2,
    type: 'triangle',
    fadeOut: true,
  },
  whoosh: {
    frequency: 300,
    duration: 0.25,
    type: 'sawtooth',
    fadeOut: true,
  },
};

/**
 * Play a synthesized notification tone
 */
export function playSynthesizedTone(
  toneId: string,
  volume: number = 0.5,
  onEnd?: () => void
): void {
  const config = TONE_CONFIGS[toneId] || TONE_CONFIGS.default;
  
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    const playOscillator = (freq: number, delay: number = 0) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.type = config.type;
      oscillator.frequency.setValueAtTime(freq, audioContext.currentTime + delay);
      
      // Set initial volume
      gainNode.gain.setValueAtTime(volume * 0.3, audioContext.currentTime + delay);
      
      // Apply fade out if configured
      if (config.fadeOut) {
        gainNode.gain.exponentialRampToValueAtTime(
          0.001,
          audioContext.currentTime + delay + config.duration
        );
      }
      
      oscillator.start(audioContext.currentTime + delay);
      oscillator.stop(audioContext.currentTime + delay + config.duration);
      
      return oscillator;
    };
    
    // Play main frequency
    const mainOsc = playOscillator(config.frequency);
    
    // Play harmonics if configured
    if (config.harmonics) {
      config.harmonics.forEach((freq, i) => {
        playOscillator(freq, (i + 1) * 0.02);
      });
    }
    
    // Call onEnd callback after duration
    if (onEnd) {
      setTimeout(() => {
        onEnd();
        audioContext.close();
      }, config.duration * 1000 + 100);
    } else {
      setTimeout(() => audioContext.close(), config.duration * 1000 + 200);
    }
  } catch (error) {
    console.error('Failed to play synthesized tone:', error);
    onEnd?.();
  }
}

/**
 * Check if a URL is a valid audio file (returns a promise)
 */
export async function checkAudioUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}
