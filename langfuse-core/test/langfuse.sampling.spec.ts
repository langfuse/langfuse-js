import { isInSample } from "../src/sampling";

describe("isInSample", () => {
  describe("edge cases", () => {
    it("should always return true when sample rate is undefined", () => {
      expect(isInSample("test-string", undefined)).toBe(true);
      expect(isInSample("", undefined)).toBe(true);
      expect(isInSample("12345", undefined)).toBe(true);
    });

    it("should always return false when sample rate is 0", () => {
      expect(isInSample("test-string", 0)).toBe(false);
      expect(isInSample("", 0)).toBe(false);
      expect(isInSample("12345", 0)).toBe(false);
    });

    it("should always return true when sample rate is 1", () => {
      expect(isInSample("test-string", 1)).toBe(true);
      expect(isInSample("", 1)).toBe(true);
      expect(isInSample("12345", 1)).toBe(true);
    });

    it("should log warning and return true for invalid sample rates", () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      expect(isInSample("test", -0.5)).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockClear();
      expect(isInSample("test", 1.5)).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("consistency", () => {
    it("should return consistent results for the same input", () => {
      const testString = "test-consistency";
      const sampleRate = 0.5;
      const firstResult = isInSample(testString, sampleRate);

      for (let i = 0; i < 100; i++) {
        expect(isInSample(testString, sampleRate)).toBe(firstResult);
      }
    });

    it("should return different results for different strings", () => {
      const sampleRate = 0.5;
      const results = new Set();

      ["test1", "test2", "test3", "different", "strings"].forEach((str) => {
        results.add(isInSample(str, sampleRate));
      });

      expect(results.size).toBeGreaterThan(1);
    });
  });

  describe("distribution", () => {
    it("should roughly match the sample rate for large numbers of inputs", () => {
      const sampleRate = 0.3;
      let inSampleCount = 0;
      const totalTests = 10_000;

      // Generate random strings and count how many are in sample
      for (let i = 0; i < totalTests; i++) {
        const testString = `test-${Math.random()}-${i}`;
        if (isInSample(testString, sampleRate)) {
          inSampleCount++;
        }
      }

      const actualRate = inSampleCount / totalTests;
      // Allow for 5% deviation from expected rate
      expect(Math.abs(actualRate - sampleRate)).toBeLessThan(0.05);
    });
  });

  describe("special inputs", () => {
    it("should handle empty strings", () => {
      const sampleRate = 0.5;
      // Just verify it doesn't throw and returns a boolean
      const result = isInSample("", sampleRate);
      expect(typeof result).toBe("boolean");
    });

    it("should handle special characters", () => {
      const sampleRate = 0.5;
      const specialChars = "!@#$%^&*()_+-=[]{}|;:,.<>?`~";
      // Just verify it doesn't throw and returns a boolean
      const result = isInSample(specialChars, sampleRate);
      expect(typeof result).toBe("boolean");
    });

    it("should handle very long strings", () => {
      const sampleRate = 0.5;
      const longString = "a".repeat(10000);
      // Just verify it doesn't throw and returns a boolean
      const result = isInSample(longString, sampleRate);
      expect(typeof result).toBe("boolean");
    });

    it("should handle unicode characters", () => {
      const sampleRate = 0.5;
      const unicodeString = "你好世界😀🌍👋";
      // Just verify it doesn't throw and returns a boolean
      const result = isInSample(unicodeString, sampleRate);
      expect(typeof result).toBe("boolean");
    });
  });

  // UUID specific tests
  describe("UUID handling", () => {
    it("should maintain consistent sampling across different UUID versions", () => {
      const sampleRate = 0.5;
      const uuidV4 = "123e4567-e89b-12d3-a456-426614174000";
      const uuidV1 = "123e4567-e89b-11d3-a456-426614174000";

      // Store initial results
      const v4Result = isInSample(uuidV4, sampleRate);
      const v1Result = isInSample(uuidV1, sampleRate);

      // Test consistency 100 times
      for (let i = 0; i < 100; i++) {
        expect(isInSample(uuidV4, sampleRate)).toBe(v4Result);
        expect(isInSample(uuidV1, sampleRate)).toBe(v1Result);
      }
    });

    it("should handle sequential UUIDs appropriately", () => {
      const sampleRate = 0.5;
      const results = new Set();

      // Generate 1000 sequential UUIDs
      for (let i = 0; i < 1000; i++) {
        const sequentialUUID = `00000000-0000-4000-8000-${i.toString().padStart(12, "0")}`;
        results.add(isInSample(sequentialUUID, sampleRate));
      }

      // Ensure we got both true and false results
      expect(results.size).toBe(2);
    });
  });

  describe("performance", () => {
    // Helper to measure execution time
    const measureExecutionTime = (fn: () => void): number => {
      const start = performance.now();
      fn();
      return performance.now() - start;
    };

    it("should handle high-frequency calls efficiently", () => {
      const sampleRate = 0.5;
      const shortString = "test-string";
      const iterations = 100_000;

      const executionTime = measureExecutionTime(() => {
        for (let i = 0; i < iterations; i++) {
          isInSample(shortString, sampleRate);
        }
      });

      // Average time per call should be less than 0.01ms (10 microseconds)
      const avgTimePerCall = executionTime / iterations;
      expect(avgTimePerCall).toBeLessThan(0.01);
    });
  });
});
