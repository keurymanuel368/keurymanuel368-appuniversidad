package app.rumbo.widget;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Lo que Rumbo le manda al widget (/api/widget/<clave>), ya leído. */
final class Model {
    static final class Cls {
        String title, code, room, sd, ed;
        int day, s, e; // day: 0 = lunes · s/e = minutos desde la medianoche
    }

    static final class Task {
        String title, when, course;
        boolean urgent, late;
        long dueAt; // segundos Unix (0 si no hay)
    }

    String mood = "tranqui", headline = "", sub = "", name = "", updated = "";
    int streak, pending, doneWeek, today, overdue, tz = -240;
    double average = -1;
    String termStart, termEnd;
    boolean payPaid;
    String payState = "closed";
    int daysToOpen, daysToClose;
    final List<Cls> schedule = new ArrayList<>();
    final List<Task> tasks = new ArrayList<>();

    static Model parse(String json) {
        if (json == null) return null;
        try {
            JSONObject d = new JSONObject(json);
            Model m = new Model();
            m.mood = d.optString("mood", "tranqui");
            m.headline = d.optString("headline");
            m.sub = d.optString("sub");
            m.name = d.optString("name");
            m.updated = d.optString("updated");
            m.streak = d.optInt("streak");
            m.pending = d.optInt("pending");
            m.doneWeek = d.optInt("doneWeek");
            m.today = d.optInt("today");
            m.overdue = d.optInt("overdue");
            m.tz = d.optInt("tz", -240);
            m.average = d.isNull("average") ? -1 : d.optDouble("average", -1);
            JSONObject term = d.optJSONObject("term");
            if (term != null) { m.termStart = term.optString("start", null); m.termEnd = term.optString("end", null); }
            JSONObject pay = d.optJSONObject("pay");
            if (pay != null) {
                m.payPaid = pay.optBoolean("paid");
                m.payState = pay.optString("state", "closed");
                m.daysToOpen = pay.optInt("daysToOpen");
                m.daysToClose = pay.optInt("daysToClose");
            }
            JSONArray sch = d.optJSONArray("schedule");
            if (sch != null) for (int i = 0; i < sch.length(); i++) {
                JSONObject o = sch.getJSONObject(i);
                Cls c = new Cls();
                c.title = o.optString("t");
                c.code = o.isNull("c") ? null : o.optString("c");
                c.day = o.optInt("d");
                c.s = o.optInt("s");
                c.e = o.optInt("e");
                c.sd = o.isNull("sd") ? null : o.optString("sd");
                c.ed = o.isNull("ed") ? null : o.optString("ed");
                c.room = o.optString("r");
                m.schedule.add(c);
            }
            JSONArray ts = d.optJSONArray("tasks");
            if (ts != null) for (int i = 0; i < ts.length(); i++) {
                JSONObject o = ts.getJSONObject(i);
                Task t = new Task();
                t.title = o.optString("title");
                t.when = o.optString("when");
                t.course = o.optString("course");
                t.urgent = o.optBoolean("urgent");
                t.late = o.optBoolean("late");
                t.dueAt = o.isNull("dueAt") ? 0 : o.optLong("dueAt");
                m.tasks.add(t);
            }
            return m;
        } catch (Exception e) {
            return null;
        }
    }
}
