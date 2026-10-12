import json
from functools import wraps

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .models import FarmProfile
from .services import profile_payload, replace_data, serialize_data
from .validation import validate_account, validate_farm_data, validate_profile

User = get_user_model()


def _json_body(request):
    try:
        return json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValidationError("Request body must contain valid JSON.") from exc


def _error(message, status=400):
    return JsonResponse({"error": message}, status=status)


def _validation_error(exc):
    if hasattr(exc, "message_dict"):
        return JsonResponse({"error": exc.message_dict}, status=400)
    return _error("; ".join(exc.messages))


def api_login_required(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return _error("Your session has expired. Please sign in again.", status=401)
        return view(request, *args, **kwargs)

    return wrapped


@ensure_csrf_cookie
@require_GET
def home(request):
    return render(request, "herd/home.html")


@require_POST
def register(request):
    try:
        values = validate_account(_json_body(request), registering=True)
    except ValidationError as exc:
        return _validation_error(exc)
    candidate = User(
        username=values["email"],
        email=values["email"],
        first_name=values["name"],
    )
    try:
        validate_password(values["password"], user=candidate)
    except ValidationError as exc:
        return _validation_error(exc)
    if User.objects.filter(username__iexact=values["email"]).exists():
        return _error("An account with this email already exists.", status=409)
    try:
        with transaction.atomic():
            user = User.objects.create_user(
                username=values["email"],
                email=values["email"],
                password=values["password"],
                first_name=values["name"],
            )
            FarmProfile.objects.create(user=user, farm_name=values["farm"])
    except IntegrityError:
        return _error("An account with this email already exists.", status=409)
    login(request, user)
    return JsonResponse({"user": profile_payload(user), "data": serialize_data(user)}, status=201)


@require_POST
def sign_in(request):
    try:
        values = validate_account(_json_body(request), registering=False)
    except ValidationError as exc:
        return _validation_error(exc)
    user = authenticate(request, username=values["email"], password=values["password"])
    if user is None:
        return _error("Wrong email or password.", status=401)
    login(request, user)
    return JsonResponse({"user": profile_payload(user), "data": serialize_data(user)})


@require_POST
def sign_out(request):
    logout(request)
    return JsonResponse({"ok": True})


@require_GET
def session(request):
    if not request.user.is_authenticated:
        return JsonResponse(
            {"user": None, "has_users": User.objects.exists()}, status=200
        )
    return JsonResponse(
        {"user": profile_payload(request.user), "data": serialize_data(request.user)}
    )


@api_login_required
@require_http_methods(["GET", "PUT"])
def data(request):
    if request.method == "GET":
        return JsonResponse({"data": serialize_data(request.user)})
    try:
        validated = validate_farm_data(_json_body(request))
        replace_data(request.user, validated)
    except ValidationError as exc:
        return _validation_error(exc)
    return JsonResponse({"data": serialize_data(request.user)})


@api_login_required
@require_POST
def profile(request):
    try:
        values = validate_profile(_json_body(request))
    except ValidationError as exc:
        return _validation_error(exc)
    request.user.first_name = values["name"]
    request.user.save(update_fields=["first_name"])
    farm_profile, _created = FarmProfile.objects.get_or_create(user=request.user)
    farm_profile.farm_name = values["farm"]
    farm_profile.save(update_fields=["farm_name"])
    return JsonResponse({"user": profile_payload(request.user)})
