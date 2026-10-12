from django.contrib import admin
from django.urls import path

from herd import views


urlpatterns = [
    path("admin/", admin.site.urls),
    path("", views.home, name="home"),
    path("api/register/", views.register, name="register"),
    path("api/login/", views.sign_in, name="login"),
    path("api/logout/", views.sign_out, name="logout"),
    path("api/session/", views.session, name="session"),
    path("api/data/", views.data, name="data"),
    path("api/profile/", views.profile, name="profile"),
]
