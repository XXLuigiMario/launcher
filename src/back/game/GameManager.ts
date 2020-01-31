import { AdditionalApp } from '@database/entity/AdditionalApp';
import { Game } from '@database/entity/Game';
import { Playlist } from '@database/entity/Playlist';
import { PlaylistGame } from '@database/entity/PlaylistGame';
import { FilterGameOpts } from '@shared/game/GameFilter';
import { ArgumentTypesOf } from '@shared/interfaces';
import { GameOrderBy, GameOrderReverse } from '@shared/order/interfaces';
import { Coerce } from '@shared/utils/Coerce';
import { Brackets, FindOneOptions, getManager, SelectQueryBuilder, EntitySchema, Repository } from 'typeorm';
import { PageIndex, Index } from '@shared/back/types';
import { VIEW_PAGE_SIZE } from '@shared/constants';

const exactFields: (keyof Game)[] = ['extreme', 'broken', 'library'];

export type FindGameOptions = {
  offset?: number;
  limit?: number;
  shallow?: boolean;
  getTotal?: boolean;
  index?: Index;
}

export namespace GameManager {
  export type GameResults = {
    games: Game[],
    total?: number
  }

  export async function countGames(): Promise<number> {
    const gameRepository = getManager().getRepository(Game);
    return gameRepository.count();
  }

  /** Find the game with the specified ID. */
  export async function findGame(id?: string, filter?: FindOneOptions<Game>): Promise<Game | undefined> {
    if (id || filter) {
      const gameRepository = getManager().getRepository(Game);
      return gameRepository.findOne(id);
    }
  }

  export async function findGameRow(gameId: string, filterOpts?: FilterGameOpts, orderBy?: GameOrderBy, direction?: GameOrderReverse,
    opts?: FindGameOptions) {
    if (opts === undefined) { opts = {}; }
    const startTime = Date.now();
    const { offset, limit, shallow, getTotal, index } = opts;
    const gameRepository = getManager().getRepository(Game);

    const subQ = gameRepository.createQueryBuilder('game')
      .select(`game.id, row_number() over (order by game.${orderBy}) row_num`);
    if (index) {
      subQ.where(`(game.${orderBy}, game.id) > (:orderVal, :id)`, { orderVal: index.orderVal, id: index.id });
    }
    if (filterOpts) {
      applyGameFilters(gameRepository, 'game', subQ, filterOpts, index ? 1 : 0);
    }
    if (orderBy) { subQ.orderBy(`game.${orderBy}`, direction); }

    const query = getManager().createQueryBuilder()
      .setParameters(subQ.getParameters())
      .select('row_num')
      .from('(' + subQ.getQuery() + ')', 'g')
      .where('g.id = :gameId', { gameId: gameId });

    const raw = await query.getRawOne();
    console.log(raw);
    console.log(`${Date.now() - startTime}ms for row`);
    return raw;
  }

  export async function findRandomGames(count: number): Promise<Game[]> {
    const gameRepository = getManager().getRepository(Game);
    const query = gameRepository.createQueryBuilder('game');
    query.where('game.id IN ' + query.subQuery().select('game_random.id').from(Game, 'game_random').orderBy('RANDOM()').take(count).getQuery());
    return query.getMany();
  }

  export async function findGamePageIndex(filterOpts: FilterGameOpts, orderBy: GameOrderBy, direction: GameOrderReverse): Promise<PageIndex> {
    const startTime = Date.now();
    const gameRepository = getManager().getRepository(Game);

    const subQ = gameRepository.createQueryBuilder('sub')
      .select(`sub.${orderBy}, sub.id, case row_number() over(order by sub.${orderBy}, sub.id) % ${VIEW_PAGE_SIZE} when 0 then 1 else 0 end page_boundary`);
    applyGameFilters(gameRepository, 'sub', subQ, filterOpts, 0);
    subQ.orderBy(`sub.${orderBy}`, direction);

    const query = getManager().createQueryBuilder()
      .select(`g.${orderBy}, g.id, row_number() over(order by g.${orderBy}) + 1 page_number`)
      .from('(' + subQ.getQuery() + ')', 'g')
      .where('g.page_boundary = 1')
      .setParameters(subQ.getParameters());

    const raw = await query.getRawMany();
    const pageIndex: PageIndex = {};
    for (let r of raw) {
      pageIndex[r['page_number']] = {orderVal: Coerce.str(r[orderBy]), id: Coerce.str(r['id'])};
    }
    console.log(`${Date.now() - startTime}ms for index`);
    return pageIndex;
  }

  /** Find the game with the specified ID. */
  export async function findGames(filterOpts?: FilterGameOpts, orderBy?: GameOrderBy, direction?: GameOrderReverse,
                                  opts?: FindGameOptions): Promise<GameResults> {
    let playlistSelect = '';
    let whereCount = 0;

    if (opts === undefined) { opts = {}; }
    const { offset, limit, shallow, getTotal, index } = opts;
    const startTime = Date.now();
    const gameRepository = getManager().getRepository(Game);
    const query = gameRepository.createQueryBuilder('game');

    if (index) {
      query.where(`(game.${orderBy}, game.id) > (:orderVal, :id)`, { orderVal: index.orderVal, id: index.id });
    }
    if (filterOpts) {
      whereCount = applyGameFilters(gameRepository, 'game', query, filterOpts, whereCount);
    }

    // Process rest of parameters
    if (orderBy) { query.orderBy(`game.${orderBy}`, direction); }
    if (!index && offset)  { console.log('OFFSET'); query.skip(offset); }
    if (limit)   { query.take(limit); }
    if (filterOpts && filterOpts.playlistId) {
      query.innerJoin(PlaylistGame, 'pg', 'pg.gameId = game.id');
      query.orderBy('pg.order');
      if (whereCount === 0) { query.where('pg.playlistId = :playlistId', { playlistId: filterOpts.playlistId }); }
      else                  { query.andWhere('pg.playlistId = :playlistId', { playlistId: filterOpts.playlistId }); }
    }

    let total: number | undefined = undefined;
    if (getTotal) {
      query.select('COUNT(*)');
      total = (await query.getRawOne())['COUNT(*)'];
      console.log(`${Date.now() - startTime}ms for query count`);
      console.log(total);
      query.select('*');
    }
    console.log(query.getQuery());
    // Subset of Game info, can be cast to ViewGame later
    if (shallow) {
      query.select('game.id, game.title, game.platform, game.tags, game.developer, game.publisher');
      const games: Game[] = await query.getRawMany();
      console.log(`${Date.now() - startTime}ms for query`);
      return { games, total };
    } else {
      const games = await query.getMany();
      console.log(`${Date.now() - startTime}ms for query`);
      return { games, total };
    }
  }

  export type ViewGame = {
    id: string;
    title: string;
    platform: string;
    // List view only
    tags: string;
    developer: string;
    publisher: string;
  }

  /** Find an add apps with the specified ID. */
  export async function findAddApp(id?: string, filter?: FindOneOptions<AdditionalApp>): Promise<AdditionalApp | undefined> {
    if (id || filter) {
      const addAppRepository = getManager().getRepository(AdditionalApp);
      return addAppRepository.findOne(id, filter);
    }
  }

  export async function findPlatformAppPaths(platform: string): Promise<string[]> {
    const gameRepository = getManager().getRepository(Game);
    const values = await gameRepository.createQueryBuilder('game')
      .select('game.applicationPath')
      .distinct()
      .where('game.platform = :platform', {platform: platform})
      .groupBy('game.applicationPath')
      .orderBy('COUNT(*)', 'DESC')
      .getRawMany();
    return Coerce.strArray(values.map(v => v['game_applicationPath']));
  }

  export async function findUniqueValues(entity: any, column: string): Promise<string[]> {
    const repository = getManager().getRepository(entity);
    const values = await repository.createQueryBuilder('entity')
      .select(`entity.${column}`)
      .distinct()
      .getRawMany();
    return Coerce.strArray(values.map(v => v[`entity_${column}`]));
  }

  export async function findUniqueValuesInOrder(entity: any, column: string): Promise<string[]> {
    const repository = getManager().getRepository(entity);
    const values = await repository.createQueryBuilder('entity')
      .select(`entity.${column}`)
      .distinct()
      .getRawMany();
    return Coerce.strArray(values.map(v => v[`entity_${column}`]));
  }

  export async function findPlatforms(library: string): Promise<string[]> {
    const gameRepository = getManager().getRepository(Game);
    const libraries = await gameRepository.createQueryBuilder('game')
      .where('game.library = :library', {library: library})
      .select('game.platform')
      .distinct()
      .getRawMany();
    return Coerce.strArray(libraries.map(l => l.game_platform));
  }

  export async function updateGames(games: Game[]): Promise<void> {
    const chunks = chunkArray(games, 2000);
    for (let chunk of chunks) {
      await getManager().transaction(async transEntityManager => {
        for (let game of chunk) {
          await transEntityManager.save(Game, game);
        }
      });
    }
  }

  export async function updateGame(game: Game): Promise<Game> {
    const gameRepository = getManager().getRepository(Game);
    return gameRepository.save(game);
  }

  export async function removeGameAndAddApps(gameId: string): Promise<void> {
    const gameRepository = getManager().getRepository(Game);
    const addAppRepository = getManager().getRepository(AdditionalApp);
    const game = await GameManager.findGame(gameId);
    if (game) {
      for (let addApp of game.addApps) {
        await addAppRepository.remove(addApp);
      }
      await gameRepository.remove(game);
    }
  }

  export async function findPlaylist(playlistId: string, join?: boolean): Promise<Playlist | undefined> {
    const opts: FindOneOptions<Playlist> = join ? { relations: ['games'] } : {};
    const playlistRepository = getManager().getRepository(Playlist);
    return playlistRepository.findOne(playlistId, opts);
  }

  /** Find playlists given a filter. @TODO filter */
  export async function findPlaylists(): Promise<Playlist[]> {
    const playlistRepository = getManager().getRepository(Playlist);
    return await playlistRepository.find();
  }

  /** Removes a playlist */
  export async function removePlaylist(playlistId: string): Promise<Playlist | undefined> {
    const playlistRepository = getManager().getRepository(Playlist);
    const playlistGameRepository = getManager().getRepository(PlaylistGame);
    const playlist = await GameManager.findPlaylist(playlistId, true);
    if (playlist) {
      for (let game of playlist.games) {
        await playlistGameRepository.remove(game);
      }
      playlist.games = [];
      return playlistRepository.remove(playlist);
    }
  }

  /** Updates a playlist */
  export async function updatePlaylist(playlist: Playlist): Promise<Playlist> {
    const playlistRepository = getManager().getRepository(Playlist);
    return playlistRepository.save(playlist);
  }

  /** Finds a Playlist Game */
  export async function findPlaylistGame(playlistId: string, gameId: string): Promise<PlaylistGame | undefined> {
    const playlistGameRepository = getManager().getRepository(PlaylistGame);
    return await playlistGameRepository.findOne({
      where: {
        gameId: gameId,
        playlistId: playlistId
      }
    });
  }

  /** Removes a Playlist Game */
  export async function removePlaylistGame(playlistId: string, gameId: string): Promise<PlaylistGame | undefined> {
    const playlistGameRepository = getManager().getRepository(PlaylistGame);
    const playlistGame = await findPlaylistGame(playlistId, gameId);
    if (playlistGame) {
      return playlistGameRepository.remove(playlistGame);
    }
  }

  /** Updates a Playlist Game */
  export async function updatePlaylistGame(playlistGame: PlaylistGame): Promise<PlaylistGame> {
    const playlistGameRepository = getManager().getRepository(PlaylistGame);
    return playlistGameRepository.save(playlistGame);
  }
}

function applyGameFilters(gameRepository: Repository<Game>, alias: string, query: SelectQueryBuilder<Game>, filterOpts: FilterGameOpts, whereCount: number): number {
  if (filterOpts) {
    // Search results
    if (filterOpts.searchQuery) {
      const searchQuery = filterOpts.searchQuery;
      // Whitelists are often more restrictive, do these first
      for (let filter of searchQuery.whitelist) {
        doWhereField(alias, query, filter.field, filter.value, whereCount, true);
        whereCount++;
      }
      for (let filter of searchQuery.blacklist) {
        doWhereField(alias, query, filter.field, filter.value, whereCount, false);
        whereCount++;
      }
      for (let phrase of searchQuery.genericWhitelist) {
        doWhereTitle(alias, query, phrase, whereCount, true);
        whereCount++;
      }
      for (let phrase of searchQuery.genericBlacklist) {
        doWhereTitle(alias, query, phrase, whereCount, false);
        whereCount++;
      }
    }
  }
  return whereCount;
}

function doWhereTitle(alias: string, query: SelectQueryBuilder<Game>, value: string, count: number, whitelist: boolean) {
  const formedValue = '%' + value + '%';
  let comparator: string;
  if (whitelist) { comparator = 'like'; }
  else           { comparator = 'not like'; }

  // console.log(`W: ${count} - C: ${comparator} - F: GENERIC - V:${value}`);

  const ref = `generic-${count}`;
  if (count === 0) {
    query.where(new Brackets(qb => {
      query.where(`${alias}.title ${comparator} :${ref}`,             { [ref]: formedValue });
      query.orWhere(`${alias}.alternateTitles ${comparator} :${ref}`, { [ref]: formedValue });
      query.orWhere(`${alias}.developer ${comparator} :${ref}`,       { [ref]: formedValue });
      query.orWhere(`${alias}.publisher ${comparator} :${ref}`,       { [ref]: formedValue });
    }));
  } else {
    query.andWhere(new Brackets(qb => {
      qb.where(`${alias}.title ${comparator} :${ref}`,             { [ref]: formedValue });
      qb.orWhere(`${alias}.alternateTitles ${comparator} :${ref}`, { [ref]: formedValue });
      qb.orWhere(`${alias}.developer ${comparator} :${ref}`,       { [ref]: formedValue });
      qb.orWhere(`${alias}.publisher ${comparator} :${ref}`,       { [ref]: formedValue });
    }));
  }
}

function doWhereField(alias: string, query: SelectQueryBuilder<Game>, field: keyof Game, value: any, count: number, whitelist: boolean) {
  // Create comparator
  const typing = typeof value;
  const exact = !(typing === 'string') || exactFields.includes(field);
  let comparator: string;
  if (!exact && value.length != '') {
    if (whitelist) { comparator = 'like'; }
    else           { comparator = 'not like'; }
  } else {
    if (whitelist) { comparator = '=';  }
    else           { comparator = '!='; }
  }

  // Create formed value
  let formedValue: any = value;
  if (!exact && value.length != '') {
    formedValue = '%' + value + '%';
  }

  // console.log(`W: ${count} - C: ${comparator} - F: ${field} - V:${value}`);
  // Do correct 'where' call
  const ref = `field-${count}`;
  if (count === 0) {
    query.where(`${alias}.${field} ${comparator} :${ref}`, { [ref]: formedValue });
  } else {
    query.andWhere(`${alias}.${field} ${comparator} :${ref}`, { [ref]: formedValue });
  }
}

function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  let chunks: T[][] = [];

  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }

  return chunks;
}