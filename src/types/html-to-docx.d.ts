/**
 * `html-to-docx` ships no types. Declared narrowly to what we actually pass, so a
 * typo in an option is still a compile error rather than `any`.
 */
declare module "html-to-docx" {
  interface DocxOptions {
    pageSize?: { width: number; height: number };
    margins?: { top?: number; right?: number; bottom?: number; left?: number };
    font?: string;
    fontSize?: number;
    table?: { row?: { cantSplit?: boolean } };
    footer?: boolean;
    header?: boolean;
    pageNumber?: boolean;
    title?: string;
    creator?: string;
  }
  export default function HTMLtoDOCX(
    html: string,
    headerHTML: string | null,
    options?: DocxOptions,
    footerHTML?: string | null,
  ): Promise<ArrayBuffer>;
}
