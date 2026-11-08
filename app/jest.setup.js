/**
 * Jest Setup File
 * Configures globals and polyfills for testing
 */

import '@testing-library/jest-dom';

// Mock AudioContext if needed (jsdom doesn't have Web Audio API by default)
if (typeof window !== 'undefined' && !window.AudioContext) {
  // Create a minimal mock for testing
  global.AudioContext = class AudioContext {
    constructor() {
      this.sampleRate = 44100;
      this.currentTime = 0;
      this.state = 'running';
      this.destination = {
        connect: () => {},
        disconnect: () => {},
      };
      this.numberOfOutputChannels = 2;
    }

    createOscillator() {
      return {
        type: 'sine',
        frequency: { value: 440, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, cancelScheduledValues: () => {} },
        connect: () => {},
        disconnect: () => {},
        start: () => {},
        stop: () => {},
        onended: null,
      };
    }

    createGain() {
      return {
        gain: { value: 1, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, cancelScheduledValues: () => {} },
        connect: () => {},
        disconnect: () => {},
      };
    }

    createBiquadFilter() {
      return {
        type: 'lowpass',
        frequency: { value: 350, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, cancelScheduledValues: () => {} },
        Q: { value: 1, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, cancelScheduledValues: () => {} },
        gain: { value: 0, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, cancelScheduledValues: () => {} },
        connect: () => {},
        disconnect: () => {},
      };
    }

    createBufferSource() {
      return {
        buffer: null,
        loop: false,
        connect: () => {},
        disconnect: () => {},
        start: () => {},
        stop: () => {},
        onended: null,
      };
    }

    createBuffer(channels, length, sampleRate) {
      return {
        numberOfChannels: channels,
        length: length,
        sampleRate: sampleRate,
        getChannelData: (channel) => new Float32Array(length),
      };
    }

    async resume() {
      this.state = 'running';
      return Promise.resolve();
    }

    async suspend() {
      this.state = 'suspended';
      return Promise.resolve();
    }

    close() {
      return Promise.resolve();
    }

    rawContext = this;
  };
}

// Mock OfflineAudioContext if needed
if (typeof window !== 'undefined' && !window.OfflineAudioContext) {
  global.OfflineAudioContext = global.AudioContext;
}
