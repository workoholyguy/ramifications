from __future__ import annotations

import datetime as dt

from sqlalchemy import ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(primary_key=True)
    canonical_sku: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    brand: Mapped[str] = mapped_column(String(64))
    model: Mapped[str] = mapped_column(String(128))
    capacity_gb: Mapped[int]
    speed_mts: Mapped[int]
    cas: Mapped[int | None]
    image_url: Mapped[str | None] = mapped_column(String(512))
    created_at: Mapped[dt.datetime] = mapped_column(server_default=func.now())

    listings: Mapped[list[Listing]] = relationship(
        back_populates="item", cascade="all, delete-orphan"
    )
    alerts: Mapped[list[Alert]] = relationship(
        back_populates="item", cascade="all, delete-orphan"
    )


class Listing(Base):
    __tablename__ = "listings"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)
    retailer: Mapped[str] = mapped_column(String(32), index=True)
    url: Mapped[str] = mapped_column(String(1024), unique=True)
    affiliate_url: Mapped[str | None] = mapped_column(String(1024))
    last_seen_at: Mapped[dt.datetime | None]

    item: Mapped[Item] = relationship(back_populates="listings")
    price_points: Mapped[list[PricePoint]] = relationship(
        back_populates="listing", cascade="all, delete-orphan"
    )
    purchases: Mapped[list[Purchase]] = relationship(
        back_populates="listing", cascade="all, delete-orphan"
    )


class PricePoint(Base):
    __tablename__ = "price_points"

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("listings.id"), index=True)
    price_cents: Mapped[int | None]
    in_stock: Mapped[bool] = mapped_column(default=True)
    title_at_scrape: Mapped[str | None] = mapped_column(String(512))
    screenshot_path: Mapped[str | None] = mapped_column(String(512))
    scraped_at: Mapped[dt.datetime] = mapped_column(server_default=func.now(), index=True)

    listing: Mapped[Listing] = relationship(back_populates="price_points")


class Purchase(Base):
    __tablename__ = "purchases"

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("listings.id"), index=True)
    purchase_date: Mapped[dt.date]
    purchase_price_cents: Mapped[int]
    created_at: Mapped[dt.datetime] = mapped_column(server_default=func.now())

    listing: Mapped[Listing] = relationship(back_populates="purchases")


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)
    target_price_cents: Mapped[int]
    created_at: Mapped[dt.datetime] = mapped_column(server_default=func.now())
    triggered_at: Mapped[dt.datetime | None]

    item: Mapped[Item] = relationship(back_populates="alerts")
