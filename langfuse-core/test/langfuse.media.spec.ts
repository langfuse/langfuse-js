import { LangfuseMedia, MediaContentType } from "../src/media/LangfuseMedia";

describe("LangfuseMedia", () => {
  describe("constructor", () => {
    it("should handle base64 data URI input", () => {
      const base64DataUri = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
      const media = new LangfuseMedia({ base64DataUri });

      expect(media._source).toBe("base64_data_uri");
      expect(media._contentType).toBe("image/jpeg");
      expect(media._contentBytes).toBeDefined();
    });

    it("should handle content bytes and type input", () => {
      const contentBytes = Buffer.from("test");
      const contentType = "image/png" as MediaContentType;
      const media = new LangfuseMedia({ contentBytes, contentType });

      expect(media._source).toBe("bytes");
      expect(media._contentType).toBe(contentType);
      expect(media._contentBytes).toBe(contentBytes);
    });

    it("should handle file path input", () => {
      const filePath = `${__dirname}/../../static/bitcoin.pdf`;
      const contentType: MediaContentType = "application/pdf";

      const media = new LangfuseMedia({ filePath, contentType });

      expect(media._source).toBe("file");
      expect(media._contentType).toBe(contentType);
      expect(media._contentBytes).toBeDefined();
    });
  });

  describe("parseReferenceString", () => {
    it("should correctly parse valid reference strings", () => {
      const refString = "@@@langfuseMedia:type=application/pdf|id=e64a339d-5051-4ffa-8992-f8baa159720a|source=bytes@@@";
      const parsed = LangfuseMedia.parseReferenceString(refString);

      expect(parsed).toEqual({
        mediaId: "e64a339d-5051-4ffa-8992-f8baa159720a",
        source: "bytes",
        contentType: "application/pdf",
      });
    });

    it("should throw error for invalid reference strings", () => {
      const invalidRef = "invalid string";
      expect(() => LangfuseMedia.parseReferenceString(invalidRef)).toThrow();
    });
  });

  describe("toJSON", () => {
    it("should return formatted string when all required fields are present", () => {
      const media = new LangfuseMedia({
        contentBytes: Buffer.from("test"),
        contentType: "image/png" as MediaContentType,
      });
      media._mediaId = "test-id";

      const json = JSON.stringify(media);
      expect(JSON.parse(json)).toBe("@@@langfuseMedia:type=image/png|id=test-id|source=bytes@@@");
    });

    it("should return error message when required fields are missing", () => {
      const media = new LangfuseMedia({
        contentBytes: Buffer.from("test"),
      });

      const json = JSON.stringify(media);
      expect(JSON.parse(json)).toMatch(/Upload handling failed/);
    });
  });

  describe("content properties", () => {
    it("should calculate correct content length", () => {
      const contentBytes = Buffer.from("test content");
      const media = new LangfuseMedia({
        contentBytes,
        contentType: "text/plain" as MediaContentType,
      });

      expect(media.contentLength).toBe(12);
    });

    it("should calculate correct SHA256 hash", () => {
      const contentBytes = Buffer.from("test content");
      const media = new LangfuseMedia({
        contentBytes,
        contentType: "text/plain" as MediaContentType,
      });

      expect(media.contentSha256Hash).toBeDefined();
      expect(typeof media.contentSha256Hash).toBe("string");
    });
  });
});
