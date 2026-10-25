package app.rumbo.widget;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.TimeZone;

/** Qué clase está en curso, cuál sigue y cómo va el trimestre, con el reloj del teléfono (hora de Rumbo, no la del aparato). */
final class Plan {
    static final String[] DIAS = {"LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"};
    static final String[] DIAS_LARGO = {"lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"};

    /** Una clase en una fecha concreta. */
    static final class Slot {
        Model.Cls cls;
        int dayOffset;      // 0 = hoy
        long startMin;      // minutos desde la medianoche de hoy (puede pasar de 1440)
        long endMin;
    }

    final int minOfDay;
    final int dayIdx;
    final int dom;          // día del mes
    final String todayIso;
    final List<Slot> todayAll = new ArrayList<>();
    Slot live;              // la que está en curso
    Slot next;              // la siguiente (hoy o en los próximos 14 días)

    // Trimestre
    boolean hasTerm, before, after;
    int week, weeks, daysToStart, daysLeft;
    double termPct;

    Plan(Model m, long nowUtcMs) {
        long local = nowUtcMs + m.tz * 60000L;
        Calendar c = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        c.setTimeInMillis(local);
        minOfDay = c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
        dayIdx = (c.get(Calendar.DAY_OF_WEEK) + 5) % 7;
        dom = c.get(Calendar.DAY_OF_MONTH);
        LocalDate today = LocalDate.of(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
        todayIso = today.toString();

        for (int off = 0; off < 14; off++) {
            LocalDate date = today.plusDays(off);
            String iso = date.toString();
            int di = (dayIdx + off) % 7;
            for (Model.Cls k : m.schedule) {
                if (k.day != di) continue;
                if (k.sd != null && iso.compareTo(k.sd) < 0) continue;
                if (k.ed != null && iso.compareTo(k.ed) > 0) continue;
                Slot s = new Slot();
                s.cls = k; s.dayOffset = off; s.startMin = off * 1440L + k.s; s.endMin = off * 1440L + k.e;
                if (off == 0) todayAll.add(s);
                if (off == 0 && k.s <= minOfDay && minOfDay < k.e) live = s;
                if ((off > 0 || k.s > minOfDay) && (next == null || s.startMin < next.startMin)) next = s;
            }
        }
        todayAll.sort((a, b) -> Long.compare(a.startMin, b.startMin));

        if (m.termStart != null && m.termEnd != null) {
            try {
                LocalDate a = LocalDate.parse(m.termStart), b = LocalDate.parse(m.termEnd);
                long total = ChronoUnit.DAYS.between(a, b) + 1, elapsed = ChronoUnit.DAYS.between(a, today);
                hasTerm = total > 0;
                weeks = (int) Math.ceil(total / 7.0);
                before = elapsed < 0; after = elapsed >= total;
                termPct = before ? 0 : after ? 1 : (elapsed + 0.5) / total;
                week = before ? 0 : (int) Math.min(weeks, elapsed / 7 + 1);
                daysToStart = (int) -elapsed;
                daysLeft = (int) ChronoUnit.DAYS.between(today, b);
            } catch (Exception ignored) { hasTerm = false; }
        }
    }

    /** Minutos hasta que empiece (negativo si ya empezó). */
    long minutesTo(Slot s) { return s.startMin - minOfDay; }

    static String h12(int min) {
        int h = min / 60, mm = min % 60;
        return (h % 12 == 0 ? 12 : h % 12) + ":" + (mm < 10 ? "0" : "") + mm + " " + (h < 12 ? "a. m." : "p. m.");
    }

    static String when(long minutes) {
        if (minutes < 60) return minutes + " min";
        if (minutes < 24 * 60) return (minutes / 60) + " h" + (minutes % 60 >= 10 ? " " + (minutes % 60) + " min" : "");
        return (minutes / 1440) + " d";
    }
}
