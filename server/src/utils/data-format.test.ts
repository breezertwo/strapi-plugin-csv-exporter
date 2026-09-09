import { describe, expect, it } from 'vitest';
import type { UID } from '@strapi/strapi';

import { expectedColumns, restructureData } from './data-format';

const uid = 'api::article.article' as UID.ContentType;

describe('restructureData', () => {
  const data = [{ title: 'Hello', secret: 'shhh' }];

  it('does not throw when "ignore" is omitted', async () => {
    await expect(restructureData(data, { columns: ['title'] }, uid, {})).resolves.toEqual([
      { title: 'Hello' },
    ]);
  });

  it('drops ignored columns when "ignore" is provided', async () => {
    const result = await restructureData(data, { columns: ['title', 'secret'] }, uid, {
      ignore: ['secret'],
    });

    expect(result).toEqual([{ title: 'Hello' }]);
  });

  it('keeps columns that are not ignored', async () => {
    const result = await restructureData(data, { columns: ['title', 'secret'] }, uid, {
      ignore: [],
    });

    expect(result).toEqual([{ title: 'Hello', secret: 'shhh' }]);
  });
});

describe('date formatting fallbacks', () => {
  const iso = [{ when: '2024-01-15T23:30:00.000Z' }];

  it('falls back to UTC, matching the documented default', async () => {
    const result = await restructureData(iso, { columns: ['when'] }, uid, {});

    expect(result[0].when).toBe('15.01.2024 23:30');
  });

  it('honours an explicit timezone', async () => {
    const result = await restructureData(iso, { columns: ['when'] }, uid, {
      timeZone: 'Europe/Berlin',
    });

    expect(result[0].when).toBe('16.01.2024 00:30');
  });
});

describe('expectedColumns', () => {
  it('lists the configured columns in order', () => {
    expect(expectedColumns({ columns: ['title', 'createdAt'] })).toEqual(['title', 'createdAt']);
  });

  it('drops ignored columns', () => {
    expect(expectedColumns({ columns: ['title', 'secret'] }, ['secret'])).toEqual(['title']);
  });

  it('adds relation keys after the plain columns', () => {
    const columns = expectedColumns({
      columns: ['title'],
      relation: { author: { column: ['name'] } },
    });

    expect(columns).toEqual(['title', 'author']);
  });

  it('flattens nested relations the way restructureData writes them', () => {
    const columns = expectedColumns({
      columns: ['title'],
      relation: {
        author: {
          column: ['name'],
          relation: { publisher: { column: ['name'] } },
        },
      },
    });

    expect(columns).toEqual(['title', 'author', 'publisher']);
  });

  it('adds custom columns last', () => {
    const columns = expectedColumns({
      columns: ['title'],
      customColumns: { slug: { column: () => 'x' } },
    });

    expect(columns).toEqual(['title', 'slug']);
  });

  it('does not repeat a name shared by a column and a relation', () => {
    const columns = expectedColumns({
      columns: ['author'],
      relation: { author: { column: ['name'] } },
    });

    expect(columns).toEqual(['author']);
  });

  it('tolerates a config without relations or custom columns', () => {
    expect(expectedColumns({ columns: ['title'] })).toEqual(['title']);
  });

  it('matches the keys restructureData produces when every field is populated', async () => {
    const config = {
      columns: ['title'],
      relation: { author: { column: ['name'] } },
      customColumns: { slug: { column: () => 'a-slug' } },
    };
    const rows = await restructureData([{ title: 'Hi', author: { name: 'Ada' } }], config, uid, {});

    expect(Object.keys(rows[0])).toEqual(expectedColumns(config));
  });

  it('keeps columns that are null across every row', async () => {
    const config = { columns: ['title', 'subtitle'] };
    const rows = await restructureData([{ title: 'Hi' }], config, uid, {});

    expect(Object.keys(rows[0])).toEqual(['title']);
    expect(expectedColumns(config)).toEqual(['title', 'subtitle']);
  });
});

describe('relation with multiple configured columns', () => {
  it('splits every configured column into its own cell, not just the first', async () => {
    const config = {
      columns: ['title'],
      relation: { category: { column: ['name', 'id', 'slug'] } },
    };
    const rows = await restructureData(
      [{ title: 'Hi', category: { id: 3, name: 'News', slug: 'news' } }],
      config,
      uid,
      {}
    );

    expect(rows[0]).toEqual({
      title: 'Hi',
      'category:name': 'News',
      'category:id': 3,
      'category:slug': 'news',
    });
    expect(expectedColumns(config)).toEqual([
      'title',
      'category:name',
      'category:id',
      'category:slug',
    ]);
  });

  it('keeps writing to the relation key when only one column is configured', async () => {
    const config = {
      columns: ['title'],
      relation: { category: { column: ['id'] } },
    };
    const rows = await restructureData([{ title: 'Hi', category: { id: 3 } }], config, uid, {});

    expect(rows[0]).toEqual({ title: 'Hi', category: 3 });
    expect(expectedColumns(config)).toEqual(['title', 'category']);
  });

  it('collects each configured column across every item in a to-many relation', async () => {
    const config = {
      columns: ['title'],
      relation: { tags: { column: ['name', 'id'] } },
    };
    const rows = await restructureData(
      [
        {
          title: 'Hi',
          tags: [
            { id: 1, name: 'a' },
            { id: 2, name: 'b' },
          ],
        },
      ],
      config,
      uid,
      {}
    );

    expect(rows[0]).toEqual({ title: 'Hi', 'tags:name': 'a, b', 'tags:id': '1, 2' });
  });
});

describe('non-datetime values', () => {
  const run = (value: any, options = {}) =>
    restructureData([{ v: value }], { columns: ['v'] }, uid, options);

  it('formats a date-only field without shifting the day', async () => {
    const result = await run('2024-01-15', { timeZone: 'Pacific/Kiritimati' });

    expect(result[0].v).toBe('15.01.2024');
  });

  it('formats a time-only field', async () => {
    expect((await run('10:30:00.000'))[0].v).toBe('10:30');
  });

  it('honours dateOnlyFormat and timeFormat', async () => {
    expect((await run('2024-01-15', { dateOnlyFormat: 'yyyy/MM/dd' }))[0].v).toBe('2024/01/15');
    expect((await run('10:30:00.000', { timeFormat: 'HH:mm:ss' }))[0].v).toBe('10:30:00');
  });

  it('still formats full datetimes with the timezone', async () => {
    const result = await run('2024-01-15T23:30:00.000Z', { timeZone: 'Europe/Berlin' });

    expect(result[0].v).toBe('16.01.2024 00:30');
  });

  it('serializes objects as JSON instead of [object Object]', async () => {
    expect((await run({ a: 1 }))[0].v).toBe('{"a":1}');
  });

  it('serializes arrays of objects instead of dropping them', async () => {
    expect((await run([{ a: 1 }, { a: 2 }]))[0].v).toBe('[{"a":1},{"a":2}]');
  });

  it('still joins arrays of scalars', async () => {
    expect((await run(['a', 'b']))[0].v).toBe('a, b');
  });

  it('leaves scalars alone', async () => {
    expect((await run(0))[0].v).toBe(0);
    expect((await run(false))[0].v).toBe(false);
    expect((await run('plain'))[0].v).toBe('plain');
  });
});
