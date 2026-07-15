/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export {};

vi.mock('server-only', () => ({}));

const searchMock = vi.fn();
const findOrCreateByNameMock = vi.fn();
const replaceForVideoMock = vi.fn();

vi.mock('@/lib/repositories/producer-repository', () => ({
  ProducerRepository: {
    search: searchMock,
    findOrCreateByName: findOrCreateByNameMock,
    replaceForVideo: replaceForVideoMock,
  },
}));

const { ProducerService } = await import('./producer-service');

describe('ProducerService.search', () => {
  beforeEach(() => {
    searchMock.mockReset();
    findOrCreateByNameMock.mockReset();
    replaceForVideoMock.mockReset();
  });

  it('returns [] for a query shorter than 2 chars without hitting the repo', async () => {
    expect(await ProducerService.search('a')).toEqual([]);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('returns [] for an empty query without hitting the repo', async () => {
    expect(await ProducerService.search('')).toEqual([]);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('returns [] for a whitespace-only query without hitting the repo', async () => {
    expect(await ProducerService.search(' ')).toEqual([]);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('delegates to the repository for a valid query and returns results', async () => {
    searchMock.mockResolvedValue([{ id: 'p1', name: 'Rick Rubin' }]);
    const results = await ProducerService.search('rick');
    expect(results).toEqual([{ id: 'p1', name: 'Rick Rubin' }]);
    expect(searchMock).toHaveBeenCalledOnce();
  });

  it('trims the query before passing it to the repository', async () => {
    searchMock.mockResolvedValue([]);
    await ProducerService.search('  rick  ');
    const [q] = searchMock.mock.calls[0] as [string, number];
    expect(q).toBe('rick');
  });

  it('passes the SEARCH_TAKE cap to the repository', async () => {
    searchMock.mockResolvedValue([]);
    await ProducerService.search('ri');
    const [, take] = searchMock.mock.calls[0] as [string, number];
    expect(take).toBe(10);
  });
});

describe('ProducerService.syncVideoProducers', () => {
  beforeEach(() => {
    searchMock.mockReset();
    findOrCreateByNameMock.mockReset();
    replaceForVideoMock.mockReset();
  });

  it('keeps existing ids without calling findOrCreateByName', async () => {
    replaceForVideoMock.mockResolvedValue(undefined);
    await ProducerService.syncVideoProducers('v1', [{ id: 'p1', name: 'Rick' }], 'user1');
    expect(findOrCreateByNameMock).not.toHaveBeenCalled();
    expect(replaceForVideoMock).toHaveBeenCalledWith('v1', ['p1']);
  });

  it('creates new producers via findOrCreateByName when no id is given', async () => {
    findOrCreateByNameMock.mockResolvedValue({ id: 'p2', name: 'New Producer' });
    replaceForVideoMock.mockResolvedValue(undefined);
    await ProducerService.syncVideoProducers('v1', [{ name: 'New Producer' }], 'user1');
    expect(findOrCreateByNameMock).toHaveBeenCalledWith('New Producer', 'user1');
    expect(replaceForVideoMock).toHaveBeenCalledWith('v1', ['p2']);
  });

  it('creates new producers and keeps existing ids, deduped', async () => {
    findOrCreateByNameMock.mockResolvedValue({ id: 'p2', name: 'New' });
    replaceForVideoMock.mockResolvedValue(undefined);
    await ProducerService.syncVideoProducers(
      'v1',
      [{ id: 'p1', name: 'Rick' }, { name: 'New' }],
      'user1'
    );
    expect(replaceForVideoMock).toHaveBeenCalledWith('v1', ['p1', 'p2']);
  });

  it('deduplicates entries with the same id', async () => {
    replaceForVideoMock.mockResolvedValue(undefined);
    await ProducerService.syncVideoProducers(
      'v1',
      [
        { id: 'p1', name: 'Rick' },
        { id: 'p1', name: 'Rick Rubin' },
      ],
      'user1'
    );
    expect(replaceForVideoMock).toHaveBeenCalledWith('v1', ['p1']);
  });

  it('skips entries with blank names', async () => {
    replaceForVideoMock.mockResolvedValue(undefined);
    await ProducerService.syncVideoProducers(
      'v1',
      [{ id: 'p1', name: 'Rick' }, { name: '   ' }],
      'user1'
    );
    expect(findOrCreateByNameMock).not.toHaveBeenCalled();
    expect(replaceForVideoMock).toHaveBeenCalledWith('v1', ['p1']);
  });

  it('calls replaceForVideo with an empty array when all entries are blank', async () => {
    replaceForVideoMock.mockResolvedValue(undefined);
    await ProducerService.syncVideoProducers('v1', [{ name: '' }]);
    expect(replaceForVideoMock).toHaveBeenCalledWith('v1', []);
  });

  it('works without a createdBy argument', async () => {
    findOrCreateByNameMock.mockResolvedValue({ id: 'p3', name: 'Solo' });
    replaceForVideoMock.mockResolvedValue(undefined);
    await ProducerService.syncVideoProducers('v1', [{ name: 'Solo' }]);
    expect(findOrCreateByNameMock).toHaveBeenCalledWith('Solo', undefined);
  });
});
