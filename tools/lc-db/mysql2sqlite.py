"""Minimal MySQL dump -> SQLite loader (schema columns + INSERT tuples)."""
import re, sqlite3, sys

def parse_values(s, i):
    rows, row, n = [], [], len(s)
    while i < n:
        c = s[i]
        if c == '(':
            row = []; i += 1
            while True:
                while s[i] in ' \n\t': i += 1
                if s[i] == "'":
                    i += 1; buf = []
                    while True:
                        ch = s[i]
                        if ch == '\\':
                            nxt = s[i+1]
                            buf.append({'n': '\n', 'r': '\r', 't': '\t', '0': '\0'}.get(nxt, nxt)); i += 2
                        elif ch == "'":
                            if s[i+1] == "'": buf.append("'"); i += 2
                            else: i += 1; break
                        else: buf.append(ch); i += 1
                    row.append(''.join(buf))
                else:
                    j = i
                    while s[j] not in ',)': j += 1
                    tok = s[i:j].strip(); i = j
                    if tok.upper() == 'NULL': row.append(None)
                    else:
                        try: row.append(int(tok))
                        except ValueError:
                            try: row.append(float(tok))
                            except ValueError: row.append(tok)
                while s[i] in ' \n\t': i += 1
                if s[i] == ',': i += 1; continue
                if s[i] == ')': i += 1; break
            rows.append(row)
        elif c == ',' or c in ' \n\t': i += 1
        elif c == ';': return rows, i + 1
        else: i += 1
    return rows, i

def load(path, db):
    s = open(path, encoding='utf-8', errors='replace').read()
    con = sqlite3.connect(db)
    for m in re.finditer(r'CREATE TABLE `(\w+)` \((.*?)\n\)', s, re.S):
        cols = re.findall(r'^\s*`(\w+)`', m.group(2), re.M)
        con.execute(f'DROP TABLE IF EXISTS "{m.group(1)}"')
        con.execute(f'CREATE TABLE "{m.group(1)}" ({",".join(chr(34)+c+chr(34) for c in cols)})')
    for m in re.finditer(r'INSERT INTO `(\w+)`(?: \([^)]*\))? VALUES ', s):
        rows, _ = parse_values(s, m.end())
        if rows:
            ph = ','.join('?' * len(rows[0]))
            try: con.executemany(f'INSERT INTO "{m.group(1)}" VALUES ({ph})', rows)
            except Exception as e: print('fail', m.group(1), e, file=sys.stderr)
    con.commit()

for p in sys.argv[2:]: load(p, sys.argv[1])
