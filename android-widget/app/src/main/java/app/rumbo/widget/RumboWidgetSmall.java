package app.rumbo.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** Widget del anillo (2×2). Comparte datos y actualización con el grande (RumboWidget). */
public class RumboWidgetSmall extends AppWidgetProvider {
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
