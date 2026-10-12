import json
from datetime import date

from django.contrib.auth import get_user_model
from django.test import Client
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.urls import reverse

from .models import Animal, FarmEvent, FarmProfile, HealthRecord
from .services import replace_data, serialize_data
from .validation import validate_farm_data


class FarmDataTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="farmer@example.com",
            email="farmer@example.com",
            password="StrongPass123!",
        )
        FarmProfile.objects.create(user=self.user, farm_name="Green Farm")

    def test_round_trip_preserves_frontend_backup_shape(self):
        payload = {
            "animals": [
                {
                    "id": "animal-1",
                    "created": date.today().isoformat(),
                    "tag": "SHE-014",
                    "species": "sheep",
                    "name": "Nour",
                    "sex": "female",
                    "breed": "",
                    "dob": "",
                    "weight": "42.5",
                    "status": "healthy",
                    "mother": "",
                    "father": "",
                    "notes": "",
                }
            ],
            "health": [
                {
                    "id": "health-1",
                    "animalId": "animal-1",
                    "date": date.today().isoformat(),
                    "type": "vaccination",
                    "title": "Annual vaccine",
                    "notes": "",
                    "resolved": True,
                }
            ],
            "events": [
                {
                    "id": "event-1",
                    "date": date.today().isoformat(),
                    "type": "vet",
                    "title": "Vet visit",
                    "animalId": "animal-1",
                    "notes": "",
                    "done": False,
                },
                {
                    "id": "event-2",
                    "date": date.today().isoformat(),
                    "type": "other",
                    "title": "Farm inspection",
                    "animalId": "",
                    "notes": "",
                    "done": True,
                },
            ],
        }
        replace_data(self.user, validate_farm_data(payload))
        result = serialize_data(self.user)
        self.assertEqual(result["animals"][0]["tag"], "SHE-014")
        self.assertEqual(result["health"][0]["animalId"], "animal-1")
        self.assertEqual(result["events"][0]["type"], "vet")
        self.assertEqual(Animal.objects.filter(owner=self.user).count(), 1)
        self.assertEqual(HealthRecord.objects.filter(owner=self.user).count(), 1)
        self.assertEqual(FarmEvent.objects.filter(owner=self.user).count(), 2)
        self.assertEqual(result["events"][1]["animalId"], "")

    def test_rejects_records_for_unknown_animals(self):
        with self.assertRaises(ValidationError):
            validate_farm_data(
                {
                    "animals": [],
                    "health": [
                        {
                            "id": "health-1",
                            "animalId": "missing",
                            "date": date.today().isoformat(),
                            "type": "illness",
                        }
                    ],
                    "events": [],
                }
            )

    def test_register_login_and_authenticated_data_endpoint(self):
        response = self.client.post(
            reverse("register"),
            data=json.dumps(
                {
                    "name": "Sam Farmer",
                    "farm": "New Farm",
                    "email": "sam@example.com",
                    "password": "StrongPass123!",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["user"]["farm"], "New Farm")
        self.client.post(reverse("logout"), data="{}", content_type="application/json")
        response = self.client.post(
            reverse("login"),
            data=json.dumps(
                {"email": "sam@example.com", "password": "StrongPass123!"}
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get(reverse("data")).status_code, 200)

    def test_data_endpoint_requires_authentication(self):
        response = self.client.put(
            reverse("data"),
            data=json.dumps({"animals": [], "events": [], "health": []}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)

    def test_api_enforces_csrf_for_mutating_requests(self):
        client = Client(enforce_csrf_checks=True)
        client.get(reverse("home"))
        response = client.post(
            reverse("register"),
            data=json.dumps(
                {
                    "name": "Sam Farmer",
                    "farm": "New Farm",
                    "email": "csrf@example.com",
                    "password": "StrongPass123!",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)
        token = client.cookies["csrftoken"].value
        response = client.post(
            reverse("register"),
            data=json.dumps(
                {
                    "name": "Sam Farmer",
                    "farm": "New Farm",
                    "email": "csrf@example.com",
                    "password": "StrongPass123!",
                }
            ),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(response.status_code, 201)

    def test_farm_records_are_isolated_by_account(self):
        self.client.force_login(self.user)
        response = self.client.put(
            reverse("data"),
            data=json.dumps({"animals": [], "health": [], "events": []}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)

        another = get_user_model().objects.create_user(
            username="another@example.com",
            email="another@example.com",
            password="StrongPass123!",
        )
        self.client.force_login(another)
        self.assertEqual(self.client.get(reverse("data")).json()["data"]["animals"], [])
