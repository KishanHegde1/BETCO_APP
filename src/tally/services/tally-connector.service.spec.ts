import { TallyConnectorService } from './tally-connector.service';

describe('TallyConnectorService read-only identity handling', () => {
  const service = new TallyConnectorService({} as never, {} as never);

  it('uses the supplied source key as the stable idempotency identity', () => {
    const sourceKey = (service as unknown as {
      sourceKey: (input: { sourceKey: string }, kind: string) => string;
    }).sourceKey({ sourceKey: 'TALLY:VOUCHER:42' }, 'invoice');

    expect(sourceKey).toBe('TALLY:VOUCHER:42');
  });

  it('uses a deterministic fallback identity when Tally has no source key', () => {
    const helper = service as unknown as {
      sourceKey: (
        input: { guid: string; voucherNumber: string; voucherDate: string },
        kind: string,
      ) => string;
    };
    const input = {
      guid: 'voucher-guid',
      voucherNumber: 'S-100',
      voucherDate: '2026-07-30',
    };

    expect(helper.sourceKey(input, 'invoice')).toBe(
      helper.sourceKey(input, 'invoice'),
    );
  });

  it('does not permit a name-only fallback as a ledger identity', () => {
    const helper = service as unknown as {
      sourceKey: (
        input: { guid: string; voucherNumber?: string; voucherDate?: string; name?: string },
        kind: string,
      ) => string;
    };

    expect(
      helper.sourceKey(
        { guid: 'stable-ledger-id', name: 'S.D.M. Energy System' },
        'ledger',
      ),
    ).toBe('stable-ledger-id');
  });

  it('does not auto-map a new ledger to a dealer during sync', async () => {
    const resolver = service as unknown as {
      resolveLedgerMapping: (
        manager: unknown,
        company: string,
        ledger: {
          sourceKey: string;
          name: string;
          openingBalance: number;
          closingBalance: number;
        },
        cache: Map<string, unknown>,
      ) => Promise<unknown>;
    };

    await expect(
      resolver.resolveLedgerMapping(
        {},
        'BETCO AQUA TRADERS',
        {
          sourceKey: 'ledger-1',
          name: 'Unknown ledger',
          openingBalance: 0,
          closingBalance: 0,
        },
        new Map(),
      ),
    ).resolves.toBeUndefined();
  });

  it('never fabricates a zero-balance ledger from an unmapped voucher', async () => {
    const resolver = service as unknown as {
      resolveVoucherMapping: (
        manager: unknown,
        company: string,
        voucher: { partyLedgerName: string; partyLedgerGuid?: string },
        mappings: Map<string, unknown>,
        mappingCache: Map<string, unknown>,
      ) => Promise<unknown>;
    };

    await expect(
      resolver.resolveVoucherMapping(
        {},
        'BETCO AQUA TRADERS',
        { partyLedgerName: 'S.D.M. Energy System' },
        new Map(),
        new Map(),
      ),
    ).resolves.toBeUndefined();
  });
});
