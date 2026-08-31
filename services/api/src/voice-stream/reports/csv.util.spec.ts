import { respondJsonOrCsv } from './csv.util';

function fakeRes() {
  return {
    json: jest.fn(),
    setHeader: jest.fn(),
    send: jest.fn(),
  } as any;
}

describe('respondJsonOrCsv', () => {
  it('returns the body as JSON when format is not csv', () => {
    const res = fakeRes();
    const body = { rows: [{ a: 1 }] };

    respondJsonOrCsv(res, 'report.csv', undefined, body);

    expect(res.json).toHaveBeenCalledWith(body);
    expect(res.send).not.toHaveBeenCalled();
  });

  it('streams a CSV download with header row and attachment filename when format=csv', () => {
    const res = fakeRes();
    const body = { rows: [{ id: 'rec-1', score: 90 }, { id: 'rec-2', score: 80 }] };

    respondJsonOrCsv(res, 'report.csv', 'csv', body);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="report.csv"');
    expect(res.send).toHaveBeenCalledWith('id,score\nrec-1,90\nrec-2,80');
  });

  it('quotes fields containing commas, quotes, or newlines', () => {
    const res = fakeRes();
    const body = { rows: [{ name: 'a, "quoted" value' }] };

    respondJsonOrCsv(res, 'report.csv', 'csv', body);

    expect(res.send).toHaveBeenCalledWith('name\n"a, ""quoted"" value"');
  });

  it('produces an empty body for an empty rows array', () => {
    const res = fakeRes();

    respondJsonOrCsv(res, 'report.csv', 'csv', { rows: [] });

    expect(res.send).toHaveBeenCalledWith('');
  });
});
