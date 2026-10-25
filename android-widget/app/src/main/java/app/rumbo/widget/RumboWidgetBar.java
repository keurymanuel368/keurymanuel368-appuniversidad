package app.rumbo.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** Barra de la siguiente clase (4×1). Comparte datos y actualización con el grande (RumboWidget). */
public class RumboWidgetBar extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        RefreshJob.schedule(ctx);
        RumboWidget.redraw(ctx);
        RumboWidget.refreshAsync(ctx, goAsync());
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle options) {
        RumboWidget.redraw(ctx);
    }
}
