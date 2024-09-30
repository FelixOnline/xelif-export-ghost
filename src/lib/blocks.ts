import SimpleDom from "simple-dom";
import imageCard from "@tryghost/kg-default-cards/lib/cards/image.js";

const serializer = new SimpleDom.HTMLSerializer(SimpleDom.voidMap);

export type Image = {
  uuid: string;
  width: number;
  height: number;
  filename: string;
  alt_text?: string;
  credit?: string;
  caption?: string;
};

export enum BlockType {
  TEXT = "text",
  REVIEW = "review",
  SIDEBAR = "sidebar",
  QUOTATION = "quotation",
  IMAGE = "image",
  BOOK_REVIEW = "book-review",
  FILM_REVIEW = "film-review",
}

export abstract class Block {
  abstract formatHtml(): string;
}

export class TextBlock extends Block {
  html: string;

  constructor(html: string) {
    super();
    this.html = html;
  }

  formatHtml(): string {
    return this.html;
  }
}

export class QuotationBlock extends Block {
  html: string;

  constructor(html: string) {
    super();
    this.html = html;
  }

  formatHtml(): string {
    return `<blockquote>${this.html}</blockquote>`;
  }
}

export class ImageBlock extends Block {
  image: Image | null;
  float: string | null;
  width: number | null;

  constructor(image: Image | null, float: string | null, width: number | null) {
    super();
    this.image = image;
    this.float = float;
    this.width = width;
  }

  formatHtml(): string {
    if (!this.image) {
      return "";
    }

    // TODO can make card float left/right and/or not full-width?

    let payload: any = {
      src: `https://felixonline.co.uk/img/${this.image.uuid}`,
    };

    if (this.image.alt_text != null) {
      payload["alt"] = this.image.alt_text;
    }

    if (this.image.caption != null && this.image.credit != null) {
      payload["caption"] =
        `${this.image.caption} / Photo: ${this.image.credit}`;
    } else if (this.image.caption != null) {
      payload["caption"] = this.image.caption;
    } else if (this.image.credit != null) {
      payload["caption"] = `Credit: ${this.image.credit}`;
    }

    return serializer.serialize(
      imageCard.render({
        env: { dom: new SimpleDom.Document() },
        payload: payload,
      }),
    );
  }
}

export class ReviewBlock extends Block {
  title: string | null;
  what: string | null;
  when: string | null;
  where: string | null;
  cost: string | null;
  stars: number | null;

  constructor(
    title: string | null,
    what: string | null,
    when: string | null,
    where: string | null,
    cost: string | null,
    stars: number | null,
  ) {
    super();
    this.title = title;
    this.what = what;
    this.when = when;
    this.where = where;
    this.cost = cost;
    this.stars = stars;
  }

  formatHtml(): string {
    let details = [
      ["What", this.what],
      ["Where", this.where],
      ["When", this.when],
      ["Cost", this.cost],
    ]
      .filter((entry) => entry[1] != null)
      .map((entry) => `<li>${entry[0]}: ${entry[1]}</li>`)
      .join("\n");

    return `
<section class="review">
    <h2>${this.title}</h2>
    <div class="stars">${"★".repeat(this.stars || 0)}</div>
    <ul>
        ${details}
    </ul>
</section>
        `;
  }
}

export class BookReviewBlock extends Block {
  stars: number | null;
  title: string | null;
  author: string | null;

  constructor(
    stars: number | null,
    title: string | null,
    author: string | null,
  ) {
    super();
    this.stars = stars;
    this.title = title;
    this.author = author;
  }

  formatHtml(): string {
    return `
<section class="review">
    <h2>${this.title}</h2>
    <div class="stars">${"★".repeat(this.stars || 0)}</div>
    <dl>
        <dt>Author</dt>
        <dd>${this.author}</dd>
    </dl>
</section>
        `;
  }
}

export class FilmReviewBlock extends Block {
  stars: number | null;
  year: string | null;
  title: string | null;
  director: string | null;
  starring: string | null;

  constructor(
    stars: number | null,
    year: string | null,
    title: string | null,
    director: string | null,
    starring: string | null,
  ) {
    super();
    this.stars = stars;
    this.year = year;
    this.title = title;
    this.director = director;
    this.starring = starring;
  }

  formatHtml(): string {
    let output = `
<section class="review">
    <h2>${this.title}</h2>
    <div class="stars">${"★".repeat(this.stars || 0)}</div>
    <dl>
        <dt>Director</dt>
        <dd>${this.director}</dd>
`;
    if (this.year) {
      output += `
        <dt>Year</dt>
        <dd>${this.year}</dd>
        `;
    }
    if (this.starring) {
      output += `
        <dt>Starring</dt>
        <dd>${this.starring}</dd>
        `;
    }
    return output + "</dl></section>";
  }
}

export class SidebarBlock extends Block {
  html: string;
  title: string | null;

  constructor(html: string, title: string | null) {
    super();
    this.html = html;
    this.title = title;
  }

  formatHtml(): string {
    return `
<section class="sidebar">
    <h2>${this.title}</h2>
    ${this.html}
</section>
        `;
  }
}
