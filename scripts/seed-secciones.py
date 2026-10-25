"""Genera scripts/seed-secciones.sql con la oferta de secciones de Mi UAPA del periodo 202634 (importada el 2026-10-25).
Uso: python scripts/seed-secciones.py  ->  luego: wrangler d1 execute rumbo-db --remote --file scripts/seed-secciones.sql
"""
import json

TITLES = {
    'CBE-110': 'Análisis y Producción de Textos', 'COE-101': 'Contabilidad I', 'FGC-105': 'Metodología de la Investigación Científica',
    'FGC-106': 'Historia Social Dominicana', 'FGC-203': 'Filosofía y Sociedad', 'FGC-208': 'Educación Constitucional',
    'FGC-409': 'Ética Profesional', 'LAF-201': 'Práctica de Física General', 'FGF-201': 'Física General',
}
RAW = """
2982|CBE-110|HN1|4|11|120|||08000900sat;2230|CBE-110|HS1|4|57|120|||08000900sat@SMC503/EAYPSD;2125|CBE-110|HV1|4|53|120|||08000900sat@MAE401PG/EDPGST;2128|CBE-110|V02|4|0|120|||18001900tue;2152|CBE-110|V04|4|0|120|||19152015thu;2162|CBE-110|V05|4|0|120|||19152015tue;2650|CBE-110|V10|4|0|120|||18001900tue;2651|CBE-110|V11|4|57|120|||19152015tue;2653|CBE-110|V12|4|23|120|||19152015wed;2460|CBE-110|V20|4|5|120|||20302130wed;2461|CBE-110|V21|4|111|120|||18001900wed;2652|CBE-110|V22|4|113|120|||18001900wed;2240|CBE-110|V30|4|103|120|||19152015thu;2654|CBE-110|V32|4|111|120|||19152015thu
2655|CBE-110|V33|4|98|120|-|18001900thu;2220|CBE-110|251|4|23|30|Recinto Santo Domingo||10301130sat@AULAA405/EDIASD;2154|CBE-110|256|4|28|30|Recinto Santo Domingo||08000900sat@AULAA403/EDIASD;2374|CBE-110|261|4|28|30|Recinto Santo Domingo||08000900sat;1005|COE-101|HS1|4|47|120|-|09151015sat@SMC402/EAYPSD;2437|COE-101|V01|4|0|120|-|19152015thu;1026|COE-101|V30|4|0|120|-|20302130wed;1027|COE-101|V31|4|0|122|-|19152015tue;1536|COE-101|251|4|19|30|Recinto Santo Domingo||09151015sat;2401|FGC-105|HS1|4|0|70|-|09151015sat@SMC502/EAYPSD;3003|FGC-105|HV1|4|0|75|-|10301130sat@MAE401PG/EDPGST;2463|FGC-105|V01|4|0|70|-|18001900mon;2470|FGC-105|V02|4|0|70|-|20302130mon;2475|FGC-105|V03|4|0|70|-|18001900mon;2722|FGC-105|V04|4|0|70|-|19152015thu;3317|FGC-105|V05|4|43|70|-|18001900mon
2232|FGC-105|V10|4|0|70|-|20302130tue;2237|FGC-105|V11|4|0|70|-|18001900tue;2238|FGC-105|V12|4|0|70|-|19152015wed;2239|FGC-105|V13|4|0|70|-|20302130tue;2709|FGC-105|V14|4|32|70|-|18001900tue;2732|FGC-105|V15|4|48|70|-|19152015tue;3318|FGC-105|V16|4|70|70|-|19152015tue;2233|FGC-105|V20|4|60|71|-|19152015wed;2710|FGC-105|V21|4|58|70|-|19152015wed;3319|FGC-105|V22|4|70|70|-|20302130wed;2464|FGC-105|V30|4|51|71|-|19152015thu;2711|FGC-105|V31|4|59|70|-|20302130thu;2733|FGC-105|V32|4|52|70|-|20302130thu;3320|FGC-105|V33|4|69|70|-|20302130thu;2358|FGC-105|250|4|22|30|Recinto Santo Domingo||11451245sat;2221|FGC-105|251|4|24|30|Recinto Santo Domingo||09151015sat@AULAA505/EDIASD
2378|FGC-105|252|4|30|30|Recinto Santo Domingo||11451245sat;2357|FGC-105|253|4|29|30|Recinto Santo Domingo||08000900sat;3269|FGC-106|HS1|3|0|50|-|08000900sat;3268|FGC-106|HV1|3|19|80|-|10301130sat;2659|FGC-106|V10|3|0|120|-|18001900tue;2234|FGC-106|V20|3|0|120|-|18001900wed;2235|FGC-106|V30|3|0|120|-|18001900thu;2227|FGC-106|250|3|22|30|Recinto Santo Domingo||10301130sat@AULAA505/EDIASD;2132|FGC-203|HV1|3|37|120|-|09151015sat@MAE401PG/EDPGST;2476|FGC-203|V01|3|0|120|-|20302130mon;2147|FGC-203|V10|3|0|120|-|18001900tue;2656|FGC-203|V11|3|25|120|-|18001900tue;2657|FGC-203|V20|3|0|120|-|19152015wed;2658|FGC-203|V30|3|3|120|-|19152015thu;2222|FGC-203|251|3|19|30|Recinto Santo Domingo||11451245sat;2623|FGC-203|253|3|22|30|Recinto Santo Domingo||10301130sat
1767|FGC-208|V01|3|0|120|-|20302130mon;1822|FGC-208|V02|3|13|120|-|20302130mon;1769|FGC-208|V06|3|24|120|-|19152015tue;1770|FGC-208|V07|3|64|120|-|18001900wed;2487|FGC-208|V10|3|83|120|-|20302130tue;3048|FGC-208|V20|3|93|120|-|18001900wed;1768|FGC-208|V40|3|51|120|-|19152015fri;1304|FGC-409|V03|3|0|120|-|18001900thu;1345|FGC-409|V04|3|0|120|-|20302130thu;1521|FGC-409|V05|3|13|121|-|18001900mon;3047|FGC-409|V10|3|57|120|-|18001900wed;1327|FGC-409|V11|3|67|120|-|18001900wed;1682|FGC-409|V21|3|53|120|-|18001900tue;1436|LAF-201|V04|1|0|70|-|20302130thu;1418|LAF-201|V05|1|25|71|-|20302130thu;1685|LAF-201|V10|1|22|70|-|19152015tue
1228|LAF-201|V11|1|18|70|-|20302130tue;2392|LAF-201|V20|1|43|70|-|19152015wed;2377|LAF-201|252|1|24|30|Recinto Santo Domingo||09151015sat@LABINF04/EDIASD;2991|LAF-201|253|1|20|30|Recinto Santo Domingo||11451245sat;3270|LAF-201|254|1|20|30|Recinto Santo Domingo||11451245sat;2446|LAF-201|350|1|30|30|Recinto Cibao Oriental ||13151415sat;1419|FGF-201|V04|4|29|120|-|19152015wed;2390|FGF-201|V10|4|30|120|-|19152015tue;1071|FGF-201|V11|4|66|120|-|18001900tue;2376|FGF-201|252|4|13|30|Recinto Santo Domingo||08000900sat@AULAA505/EDIASD;2990|FGF-201|253|4|27|30|Recinto Santo Domingo||10301130sat;3271|FGF-201|254|4|22|30|Recinto Santo Domingo||10301130sat;2445|FGF-201|350|4|27|30|Recinto Cibao Oriental ||11301300sat
"""
DAYS = {'mon': 'monday', 'tue': 'tuesday', 'wed': 'wednesday', 'thu': 'thursday', 'fri': 'friday', 'sat': 'saturday', 'sun': 'sunday'}
q = lambda s: "'" + str(s).replace("'", "''") + "'"
vals, seen = [], set()
for line in RAW.strip().splitlines():
    for rec in line.split(';'):
        f = rec.split('|')
        crn, code, sec, cr, seats, cap = f[:6]
        if crn in seen:  # NRC repetido por un error de copia: se ignora
            continue
        seen.add(crn)
        mid = f[6:-1]
        campus = next((x.strip() for x in mid if x.strip() not in ('', '-')), None)
        meetings = []
        for m in f[-1].split('+'):
            place = None
            if '@' in m:
                m, place = m.split('@')
            room, bldg = (place.split('/') + [None])[:2] if place else (None, None)
            meetings.append({'b': m[:4], 'e': m[4:8], 'd': [DAYS[m[8:11]]], 'sd': '2026-11-02', 'ed': '2027-01-17', 'room': room, 'bldg': bldg})
        vals.append(f"(1, '202634', {q(crn)}, {q(code)}, {q(TITLES[code])}, {q(sec)}, {int(cr)}, {int(seats)}, {int(cap)}, {q(campus) if campus else 'NULL'}, NULL, {q(json.dumps(meetings, ensure_ascii=False))})")
sql = "DELETE FROM uapa_sections WHERE user_id = 1 AND term = '202634';\nINSERT OR REPLACE INTO uapa_sections (user_id, term, crn, code, title, section, credits, seats, capacity, campus, faculty, meetings) VALUES\n" + ",\n".join(vals) + ";\n"
open('scripts/seed-secciones.sql', 'w', encoding='utf-8').write(sql)
print(len(vals), 'secciones')
