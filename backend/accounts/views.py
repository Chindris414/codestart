import json

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

User = get_user_model()


def _json_body(request):
    """Parse the JSON request body; return None if it is not valid JSON."""
    try:
        return json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return None


def _user_data(user):
    return {"id": user.id, "email": user.email, "name": user.name}


@require_GET
@ensure_csrf_cookie
def csrf(request):
    """Sets the csrftoken cookie so the frontend can send POST requests."""
    return JsonResponse({"detail": "CSRF cookie set."})


@require_POST
def signup(request):
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "Invalid JSON."}, status=400)

    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    name = str(data.get("name", "")).strip()[:150]

    errors = {}
    try:
        validate_email(email)
    except ValidationError:
        errors["email"] = ["Enter a valid email address."]

    if "email" not in errors and User.objects.filter(email=email).exists():
        errors["email"] = ["An account with this email already exists."]

    try:
        # Django's password rules: min length, not too common, not all numbers,
        # not too similar to the email/name
        validate_password(password, user=User(email=email, name=name))
    except ValidationError as e:
        errors["password"] = list(e.messages)

    if errors:
        return JsonResponse({"errors": errors}, status=400)

    user = User.objects.create_user(email=email, password=password, name=name)
    login(request, user)
    return JsonResponse({"user": _user_data(user)}, status=201)


@require_POST
def login_view(request):
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "Invalid JSON."}, status=400)

    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    user = authenticate(request, email=email, password=password)
    if user is None:
        # Same message whether the email or the password is wrong
        return JsonResponse({"error": "Invalid email or password."}, status=400)

    login(request, user)  # new session id + new CSRF token (prevents session fixation)
    return JsonResponse({"user": _user_data(user)})


@require_POST
def logout_view(request):
    logout(request)
    return JsonResponse({"detail": "Logged out."})


@require_GET
def me(request):
    if not request.user.is_authenticated:
        return JsonResponse({"user": None})
    return JsonResponse({"user": _user_data(request.user)})