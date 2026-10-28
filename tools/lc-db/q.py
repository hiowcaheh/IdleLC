import sqlite3, sys
c = sqlite3.connect(sys.argv[1])
for sql in sys.argv[2:]:
    cur = c.execute(sql)
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    print('##', sql)
    print(' | '.join(cols))
    for r in rows: print(' | '.join('' if v is None else str(v)[:60] for v in r))
